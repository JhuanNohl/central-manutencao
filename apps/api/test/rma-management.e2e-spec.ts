import type {
  AssigneeOption,
  PortalRmaDetail,
  RmaDetail,
  RmaInternalNoteView,
} from '@central/contracts';
import { eq } from 'drizzle-orm';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import {
  auditEvents,
  notifications,
  rmaItems,
  rmas,
} from '../src/database/schema/index.js';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  itemAt,
  recordValidationVideo,
  resetDatabase,
  signIn,
  type TestAgent,
  type TestContext,
} from './support.js';

describe('Gestão do chamado pela equipe', () => {
  let ctx: TestContext;
  let agent: TestAgent;
  let admin: TestAgent;
  let reader: TestAgent;
  let client: TestAgent;
  let agentId: string;
  let adminId: string;
  let clientAccountId: string;
  let customerId: string;
  let contactId: string;
  let number: number;
  let itemIds: string[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    agentId = await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
      name: 'Bruno Agente',
    });
    adminId = await createAccount(ctx.db, {
      email: 'admin@central.local',
      role: 'administrador',
      name: 'Ana Administradora',
    });
    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const customer = await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    });
    ({ customerId, contactId } = customer);
    clientAccountId = customer.accountId!;
    agent = await signIn(ctx, 'agente@central.local');
    admin = await signIn(ctx, 'admin@central.local');
    reader = await signIn(ctx, 'consulta@central.local');
    client = await signIn(ctx, 'cliente@um.local');
    ({ number, itemIds } = await createRma([
      'aguardando_envio',
      'aguardando_envio',
    ]));
  });

  async function createRma(stages: (typeof rmaItems.$inferInsert.stage)[]) {
    const [rma] = await ctx.db
      .insert(rmas)
      .values({ customerId, requesterContactId: contactId })
      .returning();
    const items = await ctx.db
      .insert(rmaItems)
      .values(
        stages.map((stage, index) => ({
          rmaId: rma.id,
          position: index + 1,
          model: `Modelo ${index + 1}`,
          serialNumber: `SIM-${index + 1}`,
          reportedFailure: 'Não liga',
          ...itemAt(stage ?? 'aguardando_envio'),
        })),
      )
      .returning({ id: rmaItems.id, position: rmaItems.position });
    return {
      number: rma.number,
      itemIds: items.sort((a, b) => a.position - b.position).map((i) => i.id),
    };
  }

  const detail = async (who: TestAgent = agent) =>
    (await who.get(`/api/rmas/${number}`).expect(200)).body as RmaDetail;
  const assign = (
    who: TestAgent,
    assigneeId: string | null,
    expectedAssigneeId: string | null,
  ) =>
    who
      .patch(`/api/rmas/${number}/assignee`)
      .send({ assigneeId, expectedAssigneeId });
  const changeStage = (who: TestAgent, ids: string[], stage: string) =>
    who.post(`/api/rmas/${number}/stage-changes`).send({ itemIds: ids, stage });
  const templatesSent = async () =>
    (await ctx.db.select().from(notifications)).map((n) => n.template);

  describe('responsável', () => {
    it('agente assume o chamado sem responsável, com histórico', async () => {
      const res = await assign(agent, agentId, null).expect(200);
      expect(res.body).toEqual({
        assignee: { id: agentId, name: 'Bruno Agente' },
      });
      expect((await detail()).assignee?.name).toBe('Bruno Agente');

      const [event] = await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'rma.responsavel_alterado'));
      expect(event.data).toEqual({ before: null, after: agentId });
    });

    it('recusa quando outra pessoa assumiu antes (concorrência)', async () => {
      await assign(admin, adminId, null).expect(200);
      const res = await assign(agent, agentId, null).expect(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect((await detail()).assignee?.id).toBe(adminId);
    });

    it('administrador transfere e o responsável libera o chamado', async () => {
      await assign(admin, agentId, null).expect(200);
      await assign(agent, null, agentId).expect(200);
      expect((await detail()).assignee).toBeNull();
    });

    it('só conta ativa da equipe operacional pode ser responsável', async () => {
      const res = await assign(admin, clientAccountId, null).expect(400);
      expect(res.body.error.issues[0].path).toBe('assigneeId');

      const options = (await agent.get('/api/rmas/assignees').expect(200))
        .body as AssigneeOption[];
      expect(options.map((o) => o.name)).toEqual([
        'Ana Administradora',
        'Bruno Agente',
      ]);
    });

    it('agente somente consulta e cliente não alteram o chamado', async () => {
      await assign(reader, null, null).expect(403);
      await client
        .patch(`/api/rmas/${number}/assignee`)
        .send({ assigneeId: null, expectedAssigneeId: null })
        .expect(403);
      await reader
        .patch(`/api/rmas/${number}/priority`)
        .send({ priority: 'alta' })
        .expect(403);
    });
  });

  it('altera a prioridade com o valor anterior no histórico', async () => {
    await agent
      .patch(`/api/rmas/${number}/priority`)
      .send({ priority: 'urgente' })
      .expect(200, { priority: 'urgente' });
    expect((await detail()).priority).toBe('urgente');
    const [event] = await ctx.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'rma.prioridade_alterada'));
    expect(event.data).toEqual({ before: 'normal', after: 'urgente' });
  });

  describe('etapa dos equipamentos', () => {
    beforeEach(async () => {
      ({ number, itemIds } = await createRma([
        'recebido',
        'aguardando_aprovacao',
        'aguardando_envio',
      ]));
    });

    it('o diagnóstico inicia o prazo, com a duração configurada naquele momento (CA07, CA15)', async () => {
      const env = ctx.app.get<Env>(ENV);
      env.RMA_SLA_HOURS = 240;
      try {
        await changeStage(agent, [itemIds[0]], 'em_diagnostico').expect(201);
      } finally {
        env.RMA_SLA_HOURS = 720;
      }
      const item = (await detail()).items[0];
      expect(item.sla).toMatchObject({ status: 'no_prazo', hours: 240 });
      expect(item.sla.startedAt).not.toBeNull();

      const [notice] = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.template, 'rma_etapa_alterada'));
      expect(notice.recipient).toBe('cliente@um.local');
      expect(notice.payload.items).toEqual([
        expect.stringMatching(
          /^Modelo 1 \(S\/N SIM-1\): Em diagnóstico · prazo até \d{2}\/\d{2}\/\d{4}/,
        ),
      ]);
    });

    it('avança um passo por vez, sem pular nem voltar', async () => {
      await changeStage(agent, [itemIds[0]], 'aguardando_aprovacao').expect(
        409,
      );
      await changeStage(agent, [itemIds[1]], 'em_manutencao').expect(201);
      await changeStage(agent, [itemIds[1]], 'aguardando_aprovacao').expect(
        409,
      );
      expect((await detail()).items.map((i) => i.stage)).toEqual([
        'recebido',
        'em_manutencao',
        'aguardando_envio',
      ]);
    });

    it('só a manutenção desvia: aguarda peça e volta, depois segue para testes', async () => {
      await changeStage(agent, [itemIds[1]], 'em_manutencao').expect(201);
      await changeStage(agent, [itemIds[1]], 'aguardando_peca').expect(201);
      await changeStage(agent, [itemIds[1]], 'testes').expect(409);
      await changeStage(agent, [itemIds[1]], 'em_manutencao').expect(201);
      await changeStage(agent, [itemIds[1]], 'testes').expect(201);
      await changeStage(agent, [itemIds[1]], 'aguardando_peca').expect(409);
      await changeStage(agent, [itemIds[1]], 'comprovacao').expect(201);
      expect((await detail()).items[1].stage).toBe('comprovacao');
    });

    it('é tudo ou nada: item fora do fluxo recusa a mudança inteira', async () => {
      const res = await changeStage(
        agent,
        [itemIds[0], itemIds[2]],
        'em_diagnostico',
      ).expect(409);
      expect(res.body.error.issues).toEqual([
        { path: 'itemIds.1', message: expect.any(String) },
      ]);
      expect((await detail()).items[0].stage).toBe('recebido');
    });

    it('envio e recebimento não são mudanças de etapa da equipe', async () => {
      for (const stage of ['enviado', 'recebido']) {
        const res = await changeStage(agent, [itemIds[2]], stage).expect(400);
        expect(res.body.error.issues[0].path).toBe('stage');
      }
    });

    it('a devolução exige o vídeo de comprovação e encerra o prazo', async () => {
      ({ number, itemIds } = await createRma(['comprovacao']));
      await changeStage(agent, [itemIds[0]], 'devolucao').expect(409);
      await recordValidationVideo(ctx.db, itemIds[0], agentId);
      await changeStage(agent, [itemIds[0]], 'devolucao').expect(201);
      const item = (await detail()).items[0];
      expect(item.stage).toBe('devolucao');
      expect(item.sla.finishedAt).not.toBeNull();
    });

    it('agente somente consulta não muda etapa', async () => {
      await changeStage(reader, [itemIds[0]], 'em_diagnostico').expect(403);
    });
  });

  it('encerra o chamado quando todos os equipamentos voltam ao cliente', async () => {
    ({ number, itemIds } = await createRma(['devolucao', 'devolucao']));
    await changeStage(agent, [itemIds[0]], 'finalizado').expect(201);
    const [open] = await ctx.db
      .select()
      .from(rmas)
      .where(eq(rmas.number, number));
    expect(open.closedAt).toBeNull();

    await changeStage(agent, [itemIds[1]], 'finalizado').expect(201);
    const [closed] = await ctx.db
      .select()
      .from(rmas)
      .where(eq(rmas.number, number));
    expect(closed.closedAt).not.toBeNull();
    await agent
      .patch(`/api/rmas/${number}/priority`)
      .send({ priority: 'alta' })
      .expect(409);
  });

  describe('cancelamento', () => {
    const cancel = (who: TestAgent, reason = 'Aberto em duplicidade') =>
      who.post(`/api/rmas/${number}/cancellation`).send({ reason });

    it('encerra sem apagar, com motivo no histórico e aviso ao cliente', async () => {
      const res = await cancel(agent).expect(201);
      expect(res.body.reason).toBe('Aberto em duplicidade');

      const staff = await detail();
      expect(staff.cancellation?.reason).toBe('Aberto em duplicidade');
      expect(staff.items).toHaveLength(2);
      const portal = (
        await client.get(`/api/portal/rmas/${number}`).expect(200)
      ).body as PortalRmaDetail;
      expect(portal.cancellation?.reason).toBe('Aberto em duplicidade');

      const [event] = await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'rma.cancelado'));
      expect(event.reason).toBe('Aberto em duplicidade');
      expect((await templatesSent()).sort()).toEqual([
        'equipe_rma',
        'rma_cancelado',
      ]);
    });

    it('bloqueia envio, recebimento e novas mudanças depois do cancelamento', async () => {
      await cancel(agent).expect(201);
      await client
        .post(`/api/portal/rmas/${number}/shipments`)
        .send({ itemIds: [itemIds[0]], method: 'correios' })
        .expect(409);
      await agent
        .post(`/api/rmas/${number}/receipts`)
        .send({ itemIds: [itemIds[0]] })
        .expect(409);
      await assign(agent, agentId, null).expect(409);
      await cancel(agent).expect(409);
    });

    it('o cliente desistiu na aprovação: cancela e documenta quem cancelou', async () => {
      ({ number, itemIds } = await createRma(['aguardando_aprovacao']));
      await cancel(agent, 'Cliente não aprovou o orçamento').expect(201);

      const staff = await detail();
      expect(staff.cancellation).toMatchObject({
        reason: 'Cliente não aprovou o orçamento',
        cancelledBy: { id: agentId, name: 'Bruno Agente' },
      });
      const portal = (
        await client.get(`/api/portal/rmas/${number}`).expect(200)
      ).body as PortalRmaDetail;
      expect(portal.cancellation).not.toHaveProperty('cancelledBy');
      const [row] = await ctx.db
        .select()
        .from(rmas)
        .where(eq(rmas.number, number));
      expect(row.cancelledByAccountId).toBe(agentId);
    });

    it('com equipamentos na fábrica: nota de devolução, lista no e-mail e conversa aberta', async () => {
      ({ number, itemIds } = await createRma([
        'em_diagnostico',
        'aguardando_envio',
      ]));
      await cancel(agent, 'Cliente desistiu da manutenção').expect(201);

      const [note] = (
        await agent.get(`/api/rmas/${number}/internal-notes`).expect(200)
      ).body as RmaInternalNoteView[];
      expect(note.authorName).toBe('Bruno Agente');
      expect(note.body.split('\n')).toEqual([
        'Em processo de devolução: chamado cancelado com equipamentos na fábrica.',
        'Motivo: Cliente desistiu da manutenção',
        'A devolver ao cliente:',
        '- Modelo 1 (S/N SIM-1)',
      ]);

      const [notice] = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.template, 'rma_cancelado'));
      expect(notice.payload).toMatchObject({
        returning: ['Modelo 1 (S/N SIM-1)'],
      });
      const [event] = await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'rma.cancelado'));
      expect(event.data).toEqual({ itemsToReturn: [itemIds[0]] });

      // A devolução é combinada pela conversa, que segue aberta aos dois lados.
      await client
        .post(`/api/portal/rmas/${number}/messages`)
        .send({ body: 'Podem devolver pela mesma transportadora.' })
        .expect(201);
      await agent
        .post(`/api/rmas/${number}/messages`)
        .send({ body: 'Combinado, enviamos amanhã.' })
        .expect(201);
    });

    it('sem equipamentos na fábrica, a nota registra que não há devolução', async () => {
      await cancel(agent).expect(201);
      const [note] = (
        await agent.get(`/api/rmas/${number}/internal-notes`).expect(200)
      ).body as RmaInternalNoteView[];
      expect(note.body).toContain('não há devolução');
      const [notice] = await ctx.db
        .select()
        .from(notifications)
        .where(eq(notifications.template, 'rma_cancelado'));
      expect(notice.payload).toMatchObject({ returning: [] });
    });

    it('recusa depois do despacho de algum equipamento', async () => {
      ({ number, itemIds } = await createRma(['devolucao', 'em_manutencao']));
      const res = await cancel(agent).expect(409);
      expect(res.body.error.message).toContain('antes do despacho');
      const [row] = await ctx.db
        .select()
        .from(rmas)
        .where(eq(rmas.number, number));
      expect(row.cancelledAt).toBeNull();
    });

    it('exige motivo e permissão de operação', async () => {
      await cancel(agent, ' ').expect(400);
      await cancel(reader).expect(403);
    });
  });
});
