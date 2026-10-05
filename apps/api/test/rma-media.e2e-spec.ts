import type {
  PortalRmaDetail,
  RmaDetail,
  StoredFileView,
  ValidationVideoView,
} from '@central/contracts';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Response } from 'superagent';
import { auditEvents, rmaItems } from '../src/database/schema/index.js';
import { JPEG, MP4, PDF } from './fixtures.js';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  itemAt,
  resetDatabase,
  signIn,
  TERMS_VERSION,
  type TestAgent,
  type TestContext,
} from './support.js';

/** Corpo binário como Buffer: o supertest só faz isso sozinho para imagens. */
function binary(
  res: Response,
  done: (error: Error | null, body: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('Vídeos do chamado: falha na abertura e validação no despacho', () => {
  let ctx: TestContext;
  let client: TestAgent;
  let agent: TestAgent;
  let reader: TestAgent;
  let number: number;
  let itemId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.storage.contents.clear();
    await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    });
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
      name: 'Bruno Agente',
    });
    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    client = await signIn(ctx, 'cliente@um.local');
    agent = await signIn(ctx, 'agente@central.local');
    reader = await signIn(ctx, 'consulta@central.local');
    ({ number, itemId } = await openWithVideo());
  });

  async function upload(
    who: TestAgent,
    purpose: string,
    name: string,
    content: Buffer,
  ): Promise<string> {
    const res = await who
      .post('/api/files')
      .field('purpose', purpose)
      .attach('file', content, name)
      .expect(201);
    return (res.body as StoredFileView).id;
  }

  async function openWithVideo() {
    // Os envios terminam antes da abertura: cada requisição do supertest
    // abre e fecha o próprio servidor.
    const photoId = await upload(client, 'foto_item', 'foto.jpg', JPEG);
    const videoId = await upload(client, 'video_item', 'falha.mp4', MP4);
    const declarationFileId = await upload(client, 'declaracao', 'dc.pdf', PDF);
    const res = await client
      .post('/api/portal/rmas')
      .send({
        openingKey: randomUUID(),
        termsVersion: TERMS_VERSION,
        items: [
          {
            model: 'SpeedFace V5L',
            serialNumber: 'SIM-SF-1',
            reportedFailure: 'Não reconhece faces desde ontem',
            photoIds: [photoId],
            videoId,
          },
        ],
        declarationFileId,
      })
      .expect(201);
    const [item] = await ctx.db.select().from(rmaItems);
    return { number: res.body.number as number, itemId: item.id };
  }

  const staffDetail = async () =>
    (await agent.get(`/api/rmas/${number}`).expect(200)).body as RmaDetail;
  const setStage = (stage: 'comprovacao' | 'testes') =>
    ctx.db.update(rmaItems).set(itemAt(stage)).where(eq(rmaItems.id, itemId));
  const attach = (who: TestAgent, fileId: string) =>
    who
      .put(`/api/rmas/${number}/items/${itemId}/validation-video`)
      .send({ fileId });
  const dispatch = () =>
    agent
      .post(`/api/rmas/${number}/stage-changes`)
      .send({ itemIds: [itemId], stage: 'devolucao' });

  describe('vídeo da falha', () => {
    it('fica junto das fotos do item, nas duas visões', async () => {
      const staff = (await staffDetail()).items[0];
      expect(staff.video).toMatchObject({
        name: 'falha.mp4',
        contentType: 'video/mp4',
      });
      const portal = (
        await client.get(`/api/portal/rmas/${number}`).expect(200)
      ).body as PortalRmaDetail;
      expect(portal.items[0].video?.id).toBe(staff.video?.id);
    });

    it('toca no navegador e responde o trecho pedido (Range)', async () => {
      const videoId = (await staffDetail()).items[0].video!.id;
      const path = `/api/portal/rmas/${number}/files/${videoId}`;

      const whole = await client
        .get(path)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(whole.headers['accept-ranges']).toBe('bytes');
      expect(whole.headers['content-disposition']).toMatch(/^inline;/);
      expect((whole.body as Buffer).equals(MP4)).toBe(true);

      const part = await client
        .get(path)
        .set('Range', 'bytes=4-7')
        .buffer(true)
        .parse(binary)
        .expect(206);
      expect(part.headers['content-range']).toBe(`bytes 4-7/${MP4.length}`);
      expect((part.body as Buffer).toString('latin1')).toBe('ftyp');
    });

    it('recusa vídeo falso: extensão de vídeo com outro conteúdo', async () => {
      const res = await client
        .post('/api/files')
        .field('purpose', 'video_item')
        .attach('file', JPEG, 'falha.mp4')
        .expect(400);
      expect(res.body.error.issues[0].path).toBe('file');
    });
  });

  describe('vídeo de validação', () => {
    it('só é anexado na comprovação', async () => {
      await setStage('testes');
      const fileId = await upload(agent, 'video_validacao', 'ok.mp4', MP4);
      const res = await attach(agent, fileId).expect(409);
      expect(res.body.error.message).toContain('Comprovação');
    });

    it('fica no item com quem gravou; o cliente vê o vídeo, não a conta', async () => {
      await setStage('comprovacao');
      const fileId = await upload(agent, 'video_validacao', 'ok.mp4', MP4);
      const res = await attach(agent, fileId).expect(200);
      expect(res.body as ValidationVideoView).toMatchObject({
        file: { id: fileId },
        recordedBy: { name: 'Bruno Agente' },
      });

      const portal = (
        await client.get(`/api/portal/rmas/${number}`).expect(200)
      ).body as PortalRmaDetail;
      expect(portal.items[0].validationVideo?.file.id).toBe(fileId);
      expect(portal.items[0].validationVideo).not.toHaveProperty('recordedBy');
      await client
        .get(`/api/portal/rmas/${number}/files/${fileId}`)
        .expect(200);
    });

    it('um novo vídeo substitui o anterior, citado no histórico', async () => {
      await setStage('comprovacao');
      const first = await upload(agent, 'video_validacao', 'a.mp4', MP4);
      const second = await upload(agent, 'video_validacao', 'b.mp4', MP4);
      await attach(agent, first).expect(200);
      await attach(agent, second).expect(200);

      expect((await staffDetail()).items[0].validationVideo?.file.id).toBe(
        second,
      );
      const events = await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'rma.video_validacao_anexado'));
      expect(events.map((event) => event.data?.replacedFileId)).toEqual([
        null,
        first,
      ]);
    });

    it('recusa arquivo de outra finalidade e quem só consulta', async () => {
      await setStage('comprovacao');
      const failureVideo = await upload(agent, 'video_item', 'x.mp4', MP4);
      const res = await attach(agent, failureVideo).expect(400);
      expect(res.body.error.issues[0].path).toBe('fileId');
      await attach(reader, failureVideo).expect(403);
    });

    it('é exigido para o despacho de cada equipamento', async () => {
      await setStage('comprovacao');
      const refused = await dispatch().expect(409);
      expect(refused.body.error.issues).toEqual([
        {
          path: 'itemIds.0',
          message: 'Anexe o vídeo de comprovação deste equipamento',
        },
      ]);

      const fileId = await upload(agent, 'video_validacao', 'ok.mp4', MP4);
      await attach(agent, fileId).expect(200);
      await dispatch().expect(201);
      expect((await staffDetail()).items[0].stage).toBe('devolucao');
    });
  });
});
