import type {
  MobileUploadSessionView,
  RmaDetail,
  UploadSessionCreated,
  UploadSessionView,
} from '@central/contracts';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  accounts,
  rmaItems,
  rmas,
  uploadSessions,
} from '../src/database/schema/index.js';
import { JPEG, MP4, PDF } from './fixtures.js';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  resetDatabase,
  signIn,
  type TestAgent,
  type TestContext,
} from './support.js';

describe('Envio pelo celular por QR Code', () => {
  let ctx: TestContext;
  let client: TestAgent;
  let agent: TestAgent;
  let otherClient: TestAgent;
  let customerId: string;
  let clientAccountId: string;
  let agentId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.storage.contents.clear();
    const customer = await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    });
    customerId = customer.customerId;
    clientAccountId = customer.accountId!;
    await createCustomer(ctx.db, {
      document: cnpj('222222220001'),
      name: 'Cliente Dois',
      contactEmail: 'cliente@dois.local',
      portal: true,
    });
    agentId = await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
      name: 'Bruno Agente',
    });
    client = await signIn(ctx, 'cliente@um.local');
    otherClient = await signIn(ctx, 'cliente@dois.local');
    agent = await signIn(ctx, 'agente@central.local');
  });

  /** O token vem no fragmento do link do QR Code. */
  const tokenOf = (created: UploadSessionCreated) =>
    new URL(created.url).hash.replace('#token=', '');

  async function createSession(who: TestAgent, body: object) {
    const res = await who.post('/api/upload-sessions').send(body).expect(201);
    return res.body as UploadSessionCreated;
  }
  const openingSession = (who: TestAgent = client) =>
    createSession(who, {
      kind: 'abertura',
      label: 'Equipamento 1',
      photoLimit: 2,
      videoLimit: 1,
    });

  /** O celular não tem sessão: só o token. */
  const phone = () => ctx.http();
  const phoneView = (token: string) =>
    phone().post('/api/mobile-uploads/session').send({ token });
  const phoneUpload = (
    token: string,
    media: 'foto' | 'video',
    name: string,
    content: Buffer,
  ) =>
    phone()
      .post('/api/mobile-uploads/files')
      .field('token', token)
      .field('media', media)
      .attach('file', content, name);

  describe('fotos e vídeo da abertura', () => {
    it('o celular envia sem login e os arquivos chegam à conta do computador', async () => {
      const created = await openingSession();
      expect(created.url).toMatch(/\/enviar#token=/);
      const token = tokenOf(created);

      const view = (await phoneView(token).expect(200))
        .body as MobileUploadSessionView;
      expect(view).toMatchObject({
        title: 'Novo atendimento',
        label: 'Equipamento 1',
        status: 'aberta',
        remaining: { foto: 2, video: 1 },
      });
      await phoneUpload(token, 'foto', 'frente.jpg', JPEG).expect(201);
      const afterVideo = (
        await phoneUpload(token, 'video', 'falha.mp4', MP4).expect(201)
      ).body as MobileUploadSessionView;
      expect(afterVideo.remaining).toEqual({ foto: 1, video: 0 });

      const desktop = (
        await client.get(`/api/upload-sessions/${created.id}`).expect(200)
      ).body as UploadSessionView;
      expect(desktop.files.map((f) => f.purpose)).toEqual([
        'foto_item',
        'video_item',
      ]);
      // Miniatura no computador: só para a conta dona do arquivo.
      await client.get(`/api/files/${desktop.files[0].id}`).expect(200);
      await otherClient.get(`/api/files/${desktop.files[0].id}`).expect(404);

      // Os arquivos valem na abertura como se viessem do computador.
      const declaration = await client
        .post('/api/files')
        .field('purpose', 'declaracao')
        .attach('file', PDF, 'dc.pdf')
        .expect(201);
      await client
        .post('/api/portal/rmas')
        .send({
          openingKey: randomUUID(),
          items: [
            {
              model: 'VR10',
              serialNumber: 'SIM-VR-1',
              reportedFailure: 'Não liga após queda de energia',
              photoIds: [desktop.files[0].id],
              videoId: desktop.files[1].id,
            },
          ],
          declarationFileId: declaration.body.id,
        })
        .expect(201);
    });

    it('respeita o limite de fotos do equipamento', async () => {
      const token = tokenOf(
        await createSession(client, {
          kind: 'abertura',
          label: 'Equipamento 1',
          photoLimit: 1,
          videoLimit: 0,
        }),
      );
      await phoneUpload(token, 'foto', 'a.jpg', JPEG).expect(201);
      await phoneUpload(token, 'foto', 'b.jpg', JPEG).expect(409);
      await phoneUpload(token, 'video', 'c.mp4', MP4).expect(409);
    });

    it('fechar, expirar ou desativar a conta invalida o QR Code', async () => {
      const closed = await openingSession();
      await client.delete(`/api/upload-sessions/${closed.id}`).expect(204);
      await phoneView(tokenOf(closed)).expect(404);

      const expired = await openingSession();
      await ctx.db
        .update(uploadSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(uploadSessions.id, expired.id));
      const res = await phoneView(tokenOf(expired)).expect(404);
      expect(res.body.error.message).toContain('Gere outro no computador');

      const owned = await openingSession();
      await ctx.db
        .update(accounts)
        .set({ status: 'desativada', disabledAt: new Date() })
        .where(eq(accounts.id, clientAccountId));
      await phoneUpload(tokenOf(owned), 'foto', 'a.jpg', JPEG).expect(404);
    });

    it('só a conta que gerou o código acompanha a sessão', async () => {
      const created = await openingSession();
      await otherClient.get(`/api/upload-sessions/${created.id}`).expect(404);
      await otherClient
        .delete(`/api/upload-sessions/${created.id}`)
        .expect(404);
      await phoneView('x'.repeat(43)).expect(404);
    });
  });

  describe('vídeo de validação', () => {
    let number: number;
    let itemId: string;

    beforeEach(async () => {
      const [rma] = await ctx.db
        .insert(rmas)
        .values({ customerId })
        .returning();
      const [item] = await ctx.db
        .insert(rmaItems)
        .values({
          rmaId: rma.id,
          position: 1,
          model: 'MB460',
          serialNumber: 'SIM-MB-1',
          reportedFailure: 'Teclado travado',
          stage: 'em_testes',
          receivedAt: new Date(),
          slaHours: 720,
        })
        .returning();
      number = rma.number;
      itemId = item.id;
    });

    const validationSession = (who: TestAgent = agent) =>
      who
        .post('/api/upload-sessions')
        .send({ kind: 'validacao', rmaNumber: number, itemId });

    it('o vídeo vai direto para o chamado e o código se encerra', async () => {
      const created = (await validationSession().expect(201))
        .body as UploadSessionCreated;
      const token = tokenOf(created);
      const view = (await phoneView(token).expect(200))
        .body as MobileUploadSessionView;
      expect(view).toMatchObject({
        title: `Chamado #${number}`,
        label: 'MB460 (S/N SIM-MB-1)',
        remaining: { foto: 0, video: 1 },
      });

      const done = (
        await phoneUpload(token, 'video', 'ok.mp4', MP4).expect(201)
      ).body as MobileUploadSessionView;
      expect(done.status).toBe('encerrada');

      const detail = (await agent.get(`/api/rmas/${number}`).expect(200))
        .body as RmaDetail;
      expect(detail.items[0].validationVideo).toMatchObject({
        file: { name: 'ok.mp4' },
        recordedBy: { id: agentId, name: 'Bruno Agente' },
      });
      await phoneUpload(token, 'video', 'de-novo.mp4', MP4).expect(404);
    });

    it('não aceita foto e exige permissão de operação', async () => {
      const token = tokenOf(
        (await validationSession().expect(201)).body as UploadSessionCreated,
      );
      const res = await phoneUpload(token, 'foto', 'a.jpg', JPEG).expect(400);
      expect(res.body.error.issues[0].path).toBe('media');
      await validationSession(client).expect(403);
    });

    it('fora das etapas finais, não gera o código nem anexa', async () => {
      const token = tokenOf(
        (await validationSession().expect(201)).body as UploadSessionCreated,
      );
      await ctx.db
        .update(rmaItems)
        .set({ stage: 'em_manutencao' })
        .where(eq(rmaItems.id, itemId));
      await validationSession().expect(409);

      await phoneUpload(token, 'video', 'ok.mp4', MP4).expect(409);
      // O envio recusado é desfeito: o celular pode tentar de novo.
      const view = (await phoneView(token).expect(200))
        .body as MobileUploadSessionView;
      expect(view.remaining.video).toBe(1);
    });
  });
});
