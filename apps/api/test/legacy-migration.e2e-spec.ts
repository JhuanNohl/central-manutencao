import { randomUUID } from 'node:crypto';
import type {
  PortalRmaDetail,
  RmaDetail,
  RmaSummary,
  StoredFileView,
} from '@central/contracts';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import {
  accounts,
  auditEvents,
  files,
  legacyRecords,
  notifications,
  rmaDocuments,
  rmaInvoices,
  rmaItems,
  rmas,
} from '../src/database/schema/index.js';
import { LEGACY_TICKET_SOURCE } from '../src/rmas/rma-legacy.js';
import { TEST_ENV } from '../vitest.config.e2e.js';
import { PDF, nfeXml } from './fixtures.js';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  itemAt,
  resetDatabase,
  signIn,
  type TestAgent,
  type TestContext,
} from './support.js';

/**
 * O que o sistema prepara para os dados do sistema anterior: nº antigo,
 * pendência de documentação com envio posterior, notas internas do chamado e
 * do cliente e entrada com a senha do legado.
 */
describe('Dados do sistema anterior', () => {
  let ctx: TestContext;
  let agent: TestAgent;
  let client: TestAgent;
  let customerId: string;
  let clientAccountId: string;
  let document: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.storage.contents.clear();
    document = cnpj('303030300001');
    let accountId: string | null;
    ({ customerId, accountId } = await createCustomer(ctx.db, {
      name: 'Cliente Legado',
      document,
      contactEmail: 'cliente@legado.local',
      portal: true,
    }));
    clientAccountId = accountId ?? '';
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    agent = await signIn(ctx, 'agente@central.local');
    client = await signIn(ctx, 'cliente@legado.local');
  });

  /** RMA importado: sem documentos, como os "sem NF" do legado. */
  async function importedRma(legacyNumber: string): Promise<number> {
    const [rma] = await ctx.db
      .insert(rmas)
      .values({ customerId })
      .returning({ id: rmas.id, number: rmas.number });
    await ctx.db.insert(rmaItems).values({
      rmaId: rma.id,
      position: 1,
      model: 'SpeedFace V5L',
      serialNumber: 'LEG-0001',
      reportedFailure: 'Não reconhece a face',
      ...itemAt('recebido'),
    });
    await ctx.db.insert(legacyRecords).values({
      sourceTable: LEGACY_TICKET_SOURCE,
      sourceId: '42',
      entityType: 'rma',
      entityId: rma.id,
      reference: legacyNumber,
    });
    return rma.number;
  }

  /** XML do legado guardado como veio, com o erro registrado na época. */
  async function attachDivergentInvoice(number: number) {
    const [rma] = await ctx.db
      .select({ id: rmas.id })
      .from(rmas)
      .where(eq(rmas.number, number));
    const [file] = await ctx.db
      .insert(files)
      .values({
        // Todo arquivo tem dono: o importado fica com a conta do cliente.
        ownerAccountId: clientAccountId,
        purpose: 'nota_xml',
        originalName: 'nota-antiga.xml',
        contentType: 'application/xml',
        sizeBytes: 10,
        sha256: 'legado',
        storageKey: `legado/${randomUUID()}`,
        linkedAt: new Date(),
      })
      .returning({ id: files.id });
    const [doc] = await ctx.db
      .insert(rmaDocuments)
      .values({
        rmaId: rma.id,
        kind: 'nota_xml',
        fileId: file.id,
        validationStatus: 'com_divergencias',
        rulesVersion: 'legado',
        issues: [],
      })
      .returning({ id: rmaDocuments.id });
    await ctx.db.insert(rmaInvoices).values({
      rmaId: rma.id,
      documentId: doc.id,
      number: '111',
      issuerName: 'Emitente Antigo',
      issuerDocument: document,
    });
  }

  async function upload(
    who: TestAgent,
    purpose: string,
    name: string,
    content: Buffer,
  ) {
    const res = await who
      .post('/api/files')
      .field('purpose', purpose)
      .attach('file', content, name)
      .expect(201);
    return (res.body as StoredFileView).id;
  }

  describe('nº do sistema anterior', () => {
    it('aparece na fila, no detalhe e no portal, e serve de busca', async () => {
      const number = await importedRma('985214');

      const found = await agent.get('/api/rmas?search=985214').expect(200);
      expect(
        (found.body.items as RmaSummary[]).map((rma) => rma.legacyNumber),
      ).toEqual(['985214']);
      const detail = (await agent.get(`/api/rmas/${number}`).expect(200))
        .body as RmaDetail;
      expect(detail.legacyNumber).toBe('985214');
      const portal = (
        await client.get(`/api/portal/rmas/${number}`).expect(200)
      ).body as PortalRmaDetail;
      expect(portal.legacyNumber).toBe('985214');
    });
  });

  describe('documentação pendente', () => {
    it('chamado sem documento fica pendente e entra no filtro da fila', async () => {
      const number = await importedRma('100');
      const list = await agent
        .get('/api/rmas?documentationPending=true')
        .expect(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          number,
          documentationPending: 'sem_documentacao',
        }),
      ]);
    });

    it('o cliente envia a declaração pelo portal e a pendência acaba', async () => {
      const number = await importedRma('101');
      const declarationFileId = await upload(
        client,
        'declaracao',
        'dc.pdf',
        PDF,
      );

      await client
        .post(`/api/portal/rmas/${number}/documents`)
        .send({ declarationFileId })
        .expect(204);

      const detail = (
        await client.get(`/api/portal/rmas/${number}`).expect(200)
      ).body as PortalRmaDetail;
      expect(detail.documentationPending).toBeNull();
      expect(detail.documents.map((doc) => doc.kind)).toEqual(['declaracao']);
      const actions = (await ctx.db.select().from(auditEvents)).map(
        (event) => event.action,
      );
      expect(actions).toContain('rma.documentacao_enviada');
      const [notice] = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.template, 'equipe_rma'));
      expect(notice.payload).toMatchObject({ event: 'documentacao' });

      // Sem pendência, não há o que enviar.
      const again = await upload(client, 'declaracao', 'dc2.pdf', PDF);
      await client
        .post(`/api/portal/rmas/${number}/documents`)
        .send({ declarationFileId: again })
        .expect(409);
    });

    it('a equipe troca a nota com divergências por um XML válido', async () => {
      const number = await importedRma('102');
      await attachDivergentInvoice(number);
      const before = (await agent.get(`/api/rmas/${number}`).expect(200))
        .body as RmaDetail;
      expect(before.documentationPending).toBe('nf_com_divergencias');

      const xml = nfeXml({
        number: '4521',
        issuerDocument: document,
        recipientDocument: TEST_ENV.INVOICE_RECIPIENT_DOCUMENT,
      });
      const invoiceXmlFileId = await upload(agent, 'nota_xml', 'nota.xml', xml);
      await agent
        .post(`/api/rmas/${number}/documents`)
        .send({ invoiceXmlFileId })
        .expect(204);

      const after = (await agent.get(`/api/rmas/${number}`).expect(200))
        .body as RmaDetail;
      expect(after.documentationPending).toBeNull();
      expect(after.invoices.map((invoice) => invoice.number)).toEqual(['4521']);
      expect(after.documents).toEqual([
        expect.objectContaining({ kind: 'nota_xml' }),
      ]);
    });

    it('XML que continua divergente não resolve a pendência', async () => {
      const number = await importedRma('103');
      const xml = nfeXml({
        issuerDocument: cnpj('999999990001'),
        recipientDocument: TEST_ENV.INVOICE_RECIPIENT_DOCUMENT,
      });
      const invoiceXmlFileId = await upload(
        client,
        'nota_xml',
        'nota.xml',
        xml,
      );
      const res = await client
        .post(`/api/portal/rmas/${number}/documents`)
        .send({ invoiceXmlFileId })
        .expect(400);
      expect(res.body.error.issues[0].path).toBe('invoiceXmlFileId');
    });
  });

  describe('notas internas do chamado', () => {
    it('a equipe registra e lê; o cliente e a consulta não escrevem', async () => {
      const number = await importedRma('200');
      const created = await agent
        .post(`/api/rmas/${number}/internal-notes`)
        .send({ body: 'Cliente pediu orçamento por telefone.' })
        .expect(201);
      expect(created.body).toMatchObject({ authorName: 'agente' });

      const list = await agent
        .get(`/api/rmas/${number}/internal-notes`)
        .expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({
          body: 'Cliente pediu orçamento por telefone.',
        }),
      ]);

      await client.get(`/api/rmas/${number}/internal-notes`).expect(403);
      await createAccount(ctx.db, {
        email: 'consulta@central.local',
        role: 'agente_consulta',
      });
      const reader = await signIn(ctx, 'consulta@central.local');
      await reader.get(`/api/rmas/${number}/internal-notes`).expect(200);
      await reader
        .post(`/api/rmas/${number}/internal-notes`)
        .send({ body: 'x' })
        .expect(403);
    });
  });

  describe('observações internas do cliente', () => {
    it('a equipe grava e apaga; o cliente não acessa', async () => {
      const saved = await agent
        .put(`/api/customers/${customerId}/notes`)
        .send({ body: 'Prefere retirar na fábrica.' })
        .expect(200);
      expect(saved.body).toMatchObject({
        body: 'Prefere retirar na fábrica.',
        updatedBy: { name: 'agente' },
      });

      await agent
        .put(`/api/customers/${customerId}/notes`)
        .send({ body: '' })
        .expect(200);
      const cleared = await agent
        .get(`/api/customers/${customerId}/notes`)
        .expect(200);
      expect(cleared.body).toEqual({
        body: '',
        updatedAt: null,
        updatedBy: null,
      });

      await client.get(`/api/customers/${customerId}/notes`).expect(403);
    });
  });

  describe('senha do sistema anterior', () => {
    async function importedAccount(email: string, password: string) {
      const id = await createAccount(ctx.db, { email, role: 'cliente' });
      const legacyHash = bcrypt
        .hashSync(password, 4)
        .replace(/^\$2b\$/, '$2y$');
      await ctx.db
        .update(accounts)
        .set({ passwordHash: legacyHash })
        .where(eq(accounts.id, id));
      return id;
    }

    it('entra com a senha antiga, que passa a ser guardada com Argon2id', async () => {
      const id = await importedAccount('antiga@legado.local', 'Senha-Antiga-1');
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'antiga@legado.local', password: 'Senha-Antiga-1' })
        .expect(200);
      const [account] = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, id));
      expect(account.passwordHash).toMatch(/^\$argon2id\$/);
      expect(account.passwordChangeRequired).toBe(false);
    });

    it('senha antiga fraca entra, mas exige a troca antes de seguir', async () => {
      await importedAccount('fraca@legado.local', 'senhafraca');
      const legacy = ctx.http();
      await legacy
        .post('/api/auth/login')
        .send({ email: 'fraca@legado.local', password: 'senhafraca' })
        .expect(200);
      const blocked = await legacy.get('/api/portal/rmas').expect(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    });
  });
});
