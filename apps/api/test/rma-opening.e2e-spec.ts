import {
  MAX_ITEMS_PER_RMA,
  type PortalRmaDetail,
  type PortalRmaSummary,
  type RmaDetail,
  type StoredFileView,
} from '@central/contracts';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  accounts,
  auditEvents,
  files,
  notifications,
  rmaItems,
  rmas,
} from '../src/database/schema/index.js';
import { FilesService } from '../src/files/files.service.js';
import { TEST_ENV } from '../vitest.config.e2e.js';
import { JPEG, PDF, nfeXml } from './fixtures.js';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  resetDatabase,
  signIn,
  TERMS_VERSION,
  type TestAgent,
  type TestContext,
} from './support.js';

const FACTORY = TEST_ENV.INVOICE_RECIPIENT_DOCUMENT;

describe('Abertura de RMA e consulta no portal', () => {
  let ctx: TestContext;
  let client: TestAgent;
  let document: string;
  let customerId: string;
  let contactId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.storage.contents.clear();
    ctx.mail.failing = false;
    document = cnpj('111111110001');
    ({ customerId, contactId } = await createCustomer(ctx.db, {
      document,
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    }));
    client = await signIn(ctx, 'cliente@um.local');
  });

  async function upload(
    agent: TestAgent,
    purpose: string,
    name: string,
    content: Buffer,
  ): Promise<string> {
    const res = await agent
      .post('/api/files')
      .field('purpose', purpose)
      .attach('file', content, name)
      .expect(201);
    return (res.body as StoredFileView).id;
  }

  const photo = (agent: TestAgent, name = 'foto.jpg') =>
    upload(agent, 'foto_item', name, JPEG);
  const validXml = (agent: TestAgent, issuer = document) =>
    upload(
      agent,
      'nota_xml',
      'nota.xml',
      nfeXml({ issuerDocument: issuer, recipientDocument: FACTORY }),
    );

  function item(model: string, photoIds: string[]) {
    return {
      model,
      serialNumber: `SIM-${model}`,
      reportedFailure: 'Não liga após queda de energia',
      photoIds,
    };
  }

  /** Um equipamento com foto e a declaração; a foto pode ser de outra conta. */
  async function minimalBody(agent: TestAgent, photoOwner = agent) {
    return {
      openingKey: randomUUID(),
      termsVersion: TERMS_VERSION,
      items: [item('VR10', [await photo(photoOwner)])],
      declarationFileId: await upload(agent, 'declaracao', 'dc.pdf', PDF),
    };
  }

  async function openTwoItems(agent: TestAgent) {
    const photoA = await photo(agent, 'a.jpg');
    const photoB1 = await photo(agent, 'b1.jpg');
    const photoB2 = await photo(agent, 'b2.jpg');
    const body = {
      openingKey: randomUUID(),
      termsVersion: TERMS_VERSION,
      items: [
        item('VR10', [photoA]),
        { ...item('SpeedFace', [photoB1, photoB2]), warrantyRequested: true },
      ],
      invoiceXmlFileId: await validXml(agent),
      declarationFileId: await upload(agent, 'declaracao', 'dc.pdf', PDF),
    };
    return { body, photoA, photoB1, photoB2 };
  }

  it('cliente abre com dois itens, fotos, XML e declaração, e consulta após recarregar (CA01, RF05)', async () => {
    const { body, photoA, photoB1, photoB2 } = await openTwoItems(client);
    const res = await client.post('/api/portal/rmas').send(body).expect(201);
    const number = (res.body as { number: number }).number;
    expect(number).toBeGreaterThanOrEqual(100_001);

    const detail = (await client.get(`/api/portal/rmas/${number}`).expect(200))
      .body as PortalRmaDetail;
    expect(
      detail.items.map((i) => [i.model, i.photos.map((p) => p.id)]),
    ).toEqual([
      ['VR10', [photoA]],
      ['SpeedFace', [photoB1, photoB2]],
    ]);
    expect(detail.items[1]).toMatchObject({
      warrantyRequested: true,
      warranty: 'em_analise',
      stage: 'aguardando_envio',
      sla: { status: 'nao_iniciado', startedAt: null },
    });
    expect(
      detail.documents.map((d) => [d.kind, d.validation?.status ?? null]),
    ).toEqual([
      ['declaracao', null],
      ['nota_xml', 'valido'],
    ]);
    expect(detail.invoices).toEqual([
      {
        number: '4521',
        issuerName: 'Cliente & Filhos Ltda.',
        issuerDocument: document,
      },
    ]);
    expect(detail.requester?.email).toBe('cliente@um.local');
    // O portal mostra só o nome do responsável, ainda indefinido (02/10/2026).
    expect(detail.assignee).toBeNull();

    const list = (await client.get('/api/portal/rmas').expect(200)).body as {
      items: PortalRmaSummary[];
    };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ number, itemCount: 2 });

    // Arquivos vinculados deixam de ser temporários.
    const linked = await ctx.db
      .select({ linkedAt: files.linkedAt })
      .from(files);
    expect(linked.every((f) => f.linkedAt !== null)).toBe(true);
  });

  it('o mesmo RMA aparece na fila da equipe, com histórico e aviso na transação', async () => {
    const { body } = await openTwoItems(client);
    const { number } = (await client.post('/api/portal/rmas').send(body))
      .body as {
      number: number;
    };

    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    const queue = (await agent.get('/api/rmas').expect(200)).body as {
      items: { number: number }[];
    };
    expect(queue.items.map((r) => r.number)).toEqual([number]);
    const detail = (await agent.get(`/api/rmas/${number}`).expect(200))
      .body as RmaDetail;
    expect(detail.openedBy?.name).toBe('cliente');
    expect(detail.items[0].photos).toHaveLength(1);

    const [audit] = await ctx.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'rma.aberto'));
    expect(audit.data).toMatchObject({ number, itemCount: 2 });
    const [notice] = await ctx.db
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'rma_aberto'));
    expect(notice).toMatchObject({
      recipient: 'cliente@um.local',
      status: 'pendente',
    });
    // Aberto pelo cliente, o chamado chega à caixa do setor.
    const [team] = await ctx.db
      .select()
      .from(notifications)
      .where(eq(notifications.template, 'equipe_rma'));
    expect(team.recipient).toBe('manutencao@central.local');
    expect(team.payload).toMatchObject({
      event: 'aberto',
      customerName: 'Cliente Um',
      assigneeName: null,
    });
  });

  it('abre com 200 equipamentos, cada um com a sua foto', async () => {
    const [owner] = await ctx.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, 'cliente@um.local'));
    const uploads = ctx.app.get(FilesService);
    const photos: string[] = [];
    for (let i = 0; i < MAX_ITEMS_PER_RMA; i++) {
      const stored = await uploads.upload(
        owner.id,
        'foto_item',
        `f${i}.jpg`,
        JPEG,
      );
      photos.push(stored.id);
    }
    const body = {
      openingKey: randomUUID(),
      termsVersion: TERMS_VERSION,
      items: photos.map((photoId, i) => item(`VR10-${i + 1}`, [photoId])),
      declarationFileId: await upload(client, 'declaracao', 'dc.pdf', PDF),
    };

    const res = await client.post('/api/portal/rmas').send(body).expect(201);
    const detail = (
      await client.get(`/api/portal/rmas/${res.body.number}`).expect(200)
    ).body as PortalRmaDetail;
    expect(detail.items).toHaveLength(MAX_ITEMS_PER_RMA);
    expect(detail.items.every((i) => i.photos.length === 1)).toBe(true);
    expect(detail.items[199].model).toBe('VR10-200');
  });

  it('XML com divergência não abre, mesmo se outro XML foi validado antes (CA02, CA03)', async () => {
    const valid = await validXml(client);
    await client
      .post('/api/invoice-validations')
      .send({ fileId: valid })
      .expect(200);
    const divergent = await validXml(client, cnpj('999999990001'));
    const body = {
      openingKey: randomUUID(),
      termsVersion: TERMS_VERSION,
      items: [item('VR10', [await photo(client)])],
      invoiceXmlFileId: divergent,
    };

    const res = await client.post('/api/portal/rmas').send(body).expect(400);
    expect(res.body.error.issues).toEqual([
      {
        path: 'invoiceXmlFileId',
        message: expect.stringContaining('emitente'),
      },
    ]);
    expect(await ctx.db.select().from(rmas)).toHaveLength(0);
  });

  it('falha em um vínculo desfaz tudo e a nova tentativa funciona (CA17)', async () => {
    const first = await photo(client);
    const openingKey = randomUUID();
    const body = {
      openingKey,
      termsVersion: TERMS_VERSION,
      items: [item('VR10', [first]), item('Inbio', [randomUUID()])],
      declarationFileId: await upload(client, 'declaracao', 'dc.pdf', PDF),
    };
    const failed = await client.post('/api/portal/rmas').send(body).expect(400);
    expect(failed.body.error.issues).toEqual([
      { path: 'items.1.photoIds', message: expect.stringContaining('Envie') },
    ]);
    expect(await ctx.db.select().from(rmas)).toHaveLength(0);
    expect(await ctx.db.select().from(rmaItems)).toHaveLength(0);
    const [kept] = await ctx.db.select().from(files).where(eq(files.id, first));
    expect(kept.linkedAt).toBeNull();

    const retry = await photo(client);
    body.items[1] = item('Inbio', [retry]);
    await client.post('/api/portal/rmas').send(body).expect(201);
    expect(await ctx.db.select().from(rmas)).toHaveLength(1);
  });

  it('repetir a abertura com a mesma chave não duplica, nem em paralelo (CA16)', async () => {
    const { body } = await openTwoItems(client);
    const [a, b] = await Promise.all([
      client.post('/api/portal/rmas').send(body),
      client.post('/api/portal/rmas').send(body),
    ]);
    const again = await client.post('/api/portal/rmas').send(body).expect(201);
    expect(a.body.number).toBeDefined();
    expect(
      new Set([a.body.number, b.body.number, again.body.number]).size,
    ).toBe(1);
    expect(await ctx.db.select().from(rmas)).toHaveLength(1);
  });

  it('cliente não usa arquivo nem RMA de outro cliente (CA04)', async () => {
    const { body } = await openTwoItems(client);
    const { number } = (await client.post('/api/portal/rmas').send(body))
      .body as {
      number: number;
    };
    const detail = (await client.get(`/api/portal/rmas/${number}`))
      .body as PortalRmaDetail;
    const photoId = detail.items[0].photos[0].id;

    await createCustomer(ctx.db, {
      document: cnpj('222222220001'),
      name: 'Cliente Dois',
      contactEmail: 'cliente@dois.local',
      portal: true,
    });
    const other = await signIn(ctx, 'cliente@dois.local');
    await other.get(`/api/portal/rmas/${number}`).expect(404);
    await other.get(`/api/portal/rmas/${number}/files/${photoId}`).expect(404);
    expect(
      ((await other.get('/api/portal/rmas')).body as { total: number }).total,
    ).toBe(0);

    const withOthersPhoto = await minimalBody(other, client);
    const stolen = await other
      .post('/api/portal/rmas')
      .send(withOthersPhoto)
      .expect(400);
    expect(stolen.body.error.issues[0].path).toBe('items.0.photoIds');
  });

  it('baixa a foto do próprio RMA com o tipo reconhecido', async () => {
    const { body, photoA } = await openTwoItems(client);
    const { number } = (await client.post('/api/portal/rmas').send(body))
      .body as {
      number: number;
    };
    const res = await client
      .get(`/api/portal/rmas/${number}/files/${photoA}`)
      .buffer(true)
      .expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(Buffer.from(res.body as Buffer)).toEqual(JPEG);
  });

  it('nota interna não chega ao portal (RN11)', async () => {
    const { body } = await openTwoItems(client);
    const { number } = (await client.post('/api/portal/rmas').send(body))
      .body as {
      number: number;
    };
    await ctx.db.update(rmaItems).set({ internalNote: 'Cliente difícil' });
    const res = await client.get(`/api/portal/rmas/${number}`).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('Cliente difícil');
    expect(res.body.items[0]).not.toHaveProperty('internalNote');
  });

  it('conta que já aceitou a versão vigente abre sem aceitar de novo', async () => {
    const acceptedAt = new Date('2026-10-01T12:00:00Z');
    await ctx.db
      .update(accounts)
      .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: acceptedAt })
      .where(eq(accounts.email, 'cliente@um.local'));
    const accepted = await signIn(ctx, 'cliente@um.local');
    const body = {
      ...(await minimalBody(accepted)),
      termsVersion: undefined,
    };
    const res = await accepted.post('/api/portal/rmas').send(body).expect(201);
    const [rma] = await ctx.db
      .select()
      .from(rmas)
      .where(eq(rmas.number, res.body.number));
    expect(rma).toMatchObject({
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: acceptedAt,
    });
  });

  it('grava o aceite do termo de garantia com a versão, a data e a conta', async () => {
    const terms = await client.get('/api/legal/warranty-terms').expect(200);
    expect(terms.body).toMatchObject({
      version: TERMS_VERSION,
      summary: expect.any(Array),
      sections: expect.any(Array),
    });

    // Os envios terminam antes da abertura (o supertest abre um servidor por requisição).
    const body = await minimalBody(client);
    const res = await client.post('/api/portal/rmas').send(body).expect(201);
    const [rma] = await ctx.db
      .select()
      .from(rmas)
      .where(eq(rmas.number, res.body.number));
    const [customer] = await ctx.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, 'cliente@um.local'));
    expect(rma).toMatchObject({
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: expect.any(Date),
      openedByAccountId: customer.id,
    });
    // O aceite desta abertura passa a valer para a conta.
    const [account] = await ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, customer.id));
    expect(account.termsVersion).toBe(TERMS_VERSION);

    await ctx.processor.processBatch();
    const mail = ctx.mail.sent.find((m) => m.to === 'cliente@um.local');
    expect(mail?.text).toContain(
      `Termo de garantia aceito: versão ${TERMS_VERSION}`,
    );
  });

  it('sem aceite, ou com o aceite de uma versão antiga, não abre', async () => {
    // Sem o campo: o JSON não leva propriedades indefinidas.
    const withoutTerms = {
      ...(await minimalBody(client)),
      termsVersion: undefined,
    };
    const missing = await client
      .post('/api/portal/rmas')
      .send(withoutTerms)
      .expect(400);
    expect(missing.body.error.issues).toEqual([
      { path: 'termsVersion', message: 'Leia e aceite o termo de garantia' },
    ]);

    const outdated = await client
      .post('/api/portal/rmas')
      .send({ ...withoutTerms, termsVersion: '0.9' })
      .expect(400);
    expect(outdated.body.error.issues).toEqual([
      { path: 'termsVersion', message: expect.stringContaining('atualizado') },
    ]);
    expect(await ctx.db.select().from(rmas)).toHaveLength(0);
  });

  it('SMTP indisponível preserva o RMA e deixa o aviso recuperável (CA18)', async () => {
    const { body } = await openTwoItems(client);
    const { number } = (
      await client.post('/api/portal/rmas').send(body).expect(201)
    ).body as { number: number };
    ctx.mail.failing = true;
    await ctx.processor.processBatch();
    const notices = await ctx.db.select().from(notifications);
    expect(notices.every((notice) => notice.status === 'pendente')).toBe(true);
    expect(notices[0].lastError).toContain('SMTP');
    await client.get(`/api/portal/rmas/${number}`).expect(200);
  });

  describe('abertura pela equipe', () => {
    let agent: TestAgent;

    beforeEach(async () => {
      await createAccount(ctx.db, {
        email: 'agente@central.local',
        role: 'agente',
      });
      agent = await signIn(ctx, 'agente@central.local');
    });

    it('abre para um cliente identificado, com o solicitante escolhido (RN01)', async () => {
      const body = {
        ...(await minimalBody(agent)),
        customerId,
        requesterContactId: contactId,
      };
      const res = await agent.post('/api/rmas').send(body).expect(201);
      const detail = (await agent.get(`/api/rmas/${res.body.number}`))
        .body as RmaDetail;
      expect(detail.customer.id).toBe(customerId);
      expect(detail.requester?.email).toBe('cliente@um.local');
      expect(detail.openedBy?.name).toBe('agente');
      await client.get(`/api/portal/rmas/${res.body.number}`).expect(200);

      // A equipe não aceita o termo em nome do cliente.
      const [rma] = await ctx.db
        .select()
        .from(rmas)
        .where(eq(rmas.number, res.body.number));
      expect(rma).toMatchObject({ termsVersion: null, termsAcceptedAt: null });
    });

    it('o equipamento já está na fábrica: começa em diagnóstico, com o prazo correndo', async () => {
      const body = {
        ...(await minimalBody(agent)),
        customerId,
        requesterContactId: contactId,
      };
      const res = await agent.post('/api/rmas').send(body).expect(201);
      const detail = (await agent.get(`/api/rmas/${res.body.number}`))
        .body as RmaDetail;
      expect(detail.items[0]).toMatchObject({
        stage: 'em_diagnostico',
        sla: { status: 'no_prazo', hours: 720 },
      });
      expect(detail.items[0].receivedAt).not.toBeNull();
      expect(detail.receipts).toHaveLength(1);
      expect(detail.receipts[0].receivedBy?.name).toBe('agente');

      const [notice] = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.template, 'rma_aberto_na_fabrica'));
      expect(notice.payload).toMatchObject({
        dueAtLabel: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4}/),
      });
    });

    it('recusa solicitante de outro cliente', async () => {
      const other = await createCustomer(ctx.db, {
        document: cnpj('222222220001'),
        name: 'Cliente Dois',
        contactEmail: 'contato@dois.local',
      });
      const body = {
        ...(await minimalBody(agent)),
        customerId,
        requesterContactId: other.contactId,
      };
      const res = await agent.post('/api/rmas').send(body).expect(400);
      expect(res.body.error.issues[0].path).toBe('requesterContactId');
    });

    it('agente somente consulta não abre, nem pelo portal (CA05)', async () => {
      await createAccount(ctx.db, {
        email: 'consulta@central.local',
        role: 'agente_consulta',
      });
      const reader = await signIn(ctx, 'consulta@central.local');
      const body = {
        openingKey: randomUUID(),
        termsVersion: TERMS_VERSION,
        customerId,
        requesterContactId: contactId,
        items: [],
      };
      await reader.post('/api/rmas').send(body).expect(403);
      await reader.post('/api/portal/rmas').send(body).expect(403);
    });
  });
});
