import type {
  PortalRmaDetail,
  RmaDetail,
  RmaItemStage,
  StaffReceiptView,
} from '@central/contracts';
import { eq } from 'drizzle-orm';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import {
  auditEvents,
  notifications,
  rmaItems,
  rmaReceiptItems,
  rmas,
} from '../src/database/schema/index.js';
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

describe('Envio à fábrica e recebimento parcial', () => {
  let ctx: TestContext;
  let client: TestAgent;
  let agent: TestAgent;
  let customerId: string;
  let contactId: string;
  let agentId: string;
  let number: number;
  let itemIds: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.app.get<Env>(ENV).RMA_SLA_HOURS = 720;
    ({ customerId, contactId } = await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    }));
    agentId = await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
      name: 'Bruno Agente',
    });
    client = await signIn(ctx, 'cliente@um.local');
    agent = await signIn(ctx, 'agente@central.local');
    ({ number, itemIds } = await createRma(['VR10', 'SpeedFace', 'Inbio']));
  });

  async function createRma(models: string[]) {
    const [rma] = await ctx.db
      .insert(rmas)
      .values({ customerId, requesterContactId: contactId })
      .returning();
    const items = await ctx.db
      .insert(rmaItems)
      .values(
        models.map((model, index) => ({
          rmaId: rma.id,
          position: index + 1,
          model,
          serialNumber: `SIM-${model}`,
          reportedFailure: 'Não liga',
        })),
      )
      .returning({ id: rmaItems.id, position: rmaItems.position });
    return {
      number: rma.number,
      itemIds: items.sort((a, b) => a.position - b.position).map((i) => i.id),
    };
  }

  const ship = (who: TestAgent, ids: string[], extra: object = {}) =>
    who
      .post(`/api/portal/rmas/${number}/shipments`)
      .send({ itemIds: ids, method: 'correios', ...extra });
  const receive = (who: TestAgent, ids: string[]) =>
    who.post(`/api/rmas/${number}/receipts`).send({ itemIds: ids });
  const portalDetail = async () =>
    (await client.get(`/api/portal/rmas/${number}`).expect(200))
      .body as PortalRmaDetail;
  const stagesOf = (detail: { items: { stage: RmaItemStage }[] }) =>
    detail.items.map((item) => item.stage);

  describe('envio pelo cliente', () => {
    it('move só os itens enviados e não inicia prazo (CA06)', async () => {
      const res = await ship(client, [itemIds[0], itemIds[1]], {
        trackingCode: 'BR123',
      }).expect(201);
      expect(res.body).toMatchObject({
        method: 'correios',
        trackingCode: 'BR123',
        itemIds: [itemIds[0], itemIds[1]],
      });

      const detail = await portalDetail();
      expect(stagesOf(detail)).toEqual([
        'enviado',
        'enviado',
        'aguardando_envio',
      ]);
      expect(detail.items.every((i) => i.sla.status === 'nao_iniciado')).toBe(
        true,
      );
      expect(detail.shipments).toHaveLength(1);
      expect(detail.shipments[0]).not.toHaveProperty('confirmedBy');

      const staff = (await agent.get(`/api/rmas/${number}`)).body as RmaDetail;
      expect(staff.shipments[0].confirmedBy?.name).toBe('cliente');
    });

    it('transportadora exige o nome', async () => {
      const res = await ship(client, [itemIds[0]], {
        method: 'transportadora',
      }).expect(400);
      expect(res.body.error.issues).toEqual([
        { path: 'carrier', message: 'Informe a transportadora' },
      ]);
    });

    it('item já enviado ou de outro RMA gera conflito sem gravar nada', async () => {
      await ship(client, [itemIds[0]]).expect(201);
      const other = await createRma(['K40']);
      const res = await ship(client, [
        itemIds[1],
        itemIds[0],
        other.itemIds[0],
      ]).expect(409);
      expect(
        res.body.error.issues.map((i: { path: string }) => i.path),
      ).toEqual(['itemIds.1', 'itemIds.2']);
      expect(stagesOf(await portalDetail())).toEqual([
        'enviado',
        'aguardando_envio',
        'aguardando_envio',
      ]);
    });

    it('cliente de outro cadastro não envia; equipe não envia pelo portal (CA04, CA05)', async () => {
      await createCustomer(ctx.db, {
        document: cnpj('222222220001'),
        name: 'Cliente Dois',
        contactEmail: 'cliente@dois.local',
        portal: true,
      });
      const other = await signIn(ctx, 'cliente@dois.local');
      await ship(other, [itemIds[0]]).expect(404);
      await ship(agent, [itemIds[0]]).expect(403);
    });
  });

  describe('recebimento pela equipe', () => {
    /** Só o item enviado pode ser recebido: o envio não é pulado. */
    beforeEach(async () => {
      await ship(client, itemIds).expect(201);
    });

    it('recebe dois de três; o prazo só começa no diagnóstico', async () => {
      const res = await receive(agent, [itemIds[0], itemIds[1]]).expect(201);
      const receipt = res.body as StaffReceiptView;
      expect(receipt.receivedBy?.name).toBe('Bruno Agente');

      const detail = await portalDetail();
      expect(stagesOf(detail)).toEqual(['recebido', 'recebido', 'enviado']);
      expect(detail.items[0].receivedAt).toBe(receipt.receivedAt);
      expect(detail.items.every((i) => i.sla.status === 'nao_iniciado')).toBe(
        true,
      );
      expect(detail.receipts).toEqual([
        {
          id: receipt.id,
          receivedAt: receipt.receivedAt,
          itemIds: [itemIds[0], itemIds[1]],
        },
      ]);
    });

    it('item ainda não enviado não pode ser recebido', async () => {
      const unshipped = await createRma(['K40']);
      const res = await agent
        .post(`/api/rmas/${unshipped.number}/receipts`)
        .send({ itemIds: unshipped.itemIds })
        .expect(409);
      expect(res.body.error.issues[0].path).toBe('itemIds.0');
    });

    it('o terceiro chega depois, num recebimento próprio', async () => {
      await receive(agent, [itemIds[0], itemIds[1]]).expect(201);
      await receive(agent, [itemIds[2]]).expect(201);
      const detail = await portalDetail();
      expect(stagesOf(detail)).toEqual(['recebido', 'recebido', 'recebido']);
      expect(detail.receipts).toHaveLength(2);
    });

    it('repetir não registra de novo; em paralelo, só um recebimento vale (CA16)', async () => {
      await receive(agent, [itemIds[0]]).expect(201);
      const [before] = (await portalDetail()).items;
      const repeated = await receive(agent, [itemIds[0]]).expect(409);
      expect(repeated.body.error.issues[0].path).toBe('itemIds.0');
      expect((await portalDetail()).items[0].receivedAt).toBe(
        before.receivedAt,
      );

      const results = await Promise.all([
        receive(agent, [itemIds[1]]),
        receive(agent, [itemIds[1]]),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const rows = await ctx.db
        .select()
        .from(rmaReceiptItems)
        .where(eq(rmaReceiptItems.itemId, itemIds[1]));
      expect(rows).toHaveLength(1);
    });

    it('registra histórico e avisa que o prazo começa no diagnóstico', async () => {
      await receive(agent, [itemIds[1], itemIds[0]]).expect(201);
      const [audit] = await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'rma.itens_recebidos'));
      expect(audit.data).toMatchObject({ itemIds: [itemIds[1], itemIds[0]] });
      const [notice] = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.template, 'rma_itens_recebidos'));
      expect(notice.recipient).toBe('cliente@um.local');
      expect((notice.payload as { items: string[] }).items).toEqual([
        'VR10 (S/N SIM-VR10)',
        'SpeedFace (S/N SIM-SpeedFace)',
      ]);
    });

    it('atribuir responsável não inicia o prazo (RN04)', async () => {
      await ctx.db
        .update(rmas)
        .set({ assigneeAccountId: agentId })
        .where(eq(rmas.number, number));
      const detail = (await agent.get(`/api/rmas/${number}`)).body as RmaDetail;
      expect(detail.assignee?.name).toBe('Bruno Agente');
      expect(detail.items.every((i) => i.sla.status === 'nao_iniciado')).toBe(
        true,
      );
    });

    it('consulta e cliente não registram recebimento (CA05)', async () => {
      await createAccount(ctx.db, {
        email: 'consulta@central.local',
        role: 'agente_consulta',
      });
      const reader = await signIn(ctx, 'consulta@central.local');
      await receive(reader, [itemIds[0]]).expect(403);
      await receive(client, [itemIds[0]]).expect(403);
      expect((await portalDetail()).receipts).toHaveLength(0);
    });
  });
});
