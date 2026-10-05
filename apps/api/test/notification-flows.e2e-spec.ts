import type { NotificationTemplate, PortalRmaDetail } from '@central/contracts';
import { and, eq } from 'drizzle-orm';
import { notifications, rmaItems, rmas } from '../src/database/schema/index.js';
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

const INBOX = 'manutencao@central.local';
const CLIENT = 'cliente@um.local';

describe('Avisos por e-mail entre cliente, setor e agente', () => {
  let ctx: TestContext;
  let client: TestAgent;
  let agent: TestAgent;
  let agentId: string;
  let number: number;
  let itemId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.mail.sent = [];
    agentId = await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
      name: 'Bruno Agente',
    });
    const { customerId, contactId } = await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: CLIENT,
      portal: true,
    });
    client = await signIn(ctx, CLIENT);
    agent = await signIn(ctx, 'agente@central.local');
    const [rma] = await ctx.db
      .insert(rmas)
      .values({ customerId, requesterContactId: contactId })
      .returning();
    const [item] = await ctx.db
      .insert(rmaItems)
      .values({
        rmaId: rma.id,
        position: 1,
        model: 'VR10',
        serialNumber: 'SIM-1',
        reportedFailure: 'Não liga',
      })
      .returning();
    number = rma.number;
    itemId = item.id;
  });

  const noticesTo = (recipient: string, template: NotificationTemplate) =>
    ctx.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipient, recipient),
          eq(notifications.template, template),
        ),
      );
  const teamEvents = async () =>
    (await noticesTo(INBOX, 'equipe_rma')).map((n) => n.payload.event);

  it('envio informado: confirmação ao cliente e aviso ao setor', async () => {
    await client
      .post(`/api/portal/rmas/${number}/shipments`)
      .send({ itemIds: [itemId], method: 'correios', trackingCode: 'BR1' })
      .expect(201);

    const [toClient] = await noticesTo(CLIENT, 'rma_etapa_alterada');
    expect(toClient.payload.items).toEqual(['VR10 (S/N SIM-1): Enviado']);
    const [toTeam] = await noticesTo(INBOX, 'equipe_rma');
    expect(toTeam.payload).toMatchObject({
      event: 'envio',
      customerName: 'Cliente Um',
      items: ['VR10 (S/N SIM-1)'],
      // Fora da lista: não some quando ela é cortada no e-mail.
      shipping: 'Envio: Correios · rastreio BR1',
    });

    await ctx.processor.processBatch();
    const mail = ctx.mail.sent.find((m) => m.to === INBOX);
    expect(mail?.subject).toBe(`Envio informado — chamado #${number}`);
    expect(mail?.text).toContain('Responsável: sem responsável.');
    expect(mail?.text).toContain(`/chamados/${number}`);
  });

  it('recebimento e cada mudança de etapa chegam ao setor e ao cliente', async () => {
    await client
      .post(`/api/portal/rmas/${number}/shipments`)
      .send({ itemIds: [itemId], method: 'correios' })
      .expect(201);
    await agent
      .post(`/api/rmas/${number}/receipts`)
      .send({ itemIds: [itemId] })
      .expect(201);
    await agent
      .post(`/api/rmas/${number}/stage-changes`)
      .send({ itemIds: [itemId], stage: 'em_diagnostico' })
      .expect(201);

    expect(await teamEvents()).toEqual(
      expect.arrayContaining(['envio', 'recebimento', 'etapa']),
    );
    const toClient = await noticesTo(CLIENT, 'rma_etapa_alterada');
    expect(toClient.map((n) => n.payload.items)).toContainEqual([
      expect.stringMatching(/^VR10 \(S\/N SIM-1\): Em diagnóstico · prazo até/),
    ]);
    expect(await noticesTo(CLIENT, 'rma_itens_recebidos')).toHaveLength(1);
  });

  it('agente assume: o cliente sabe quem é o responsável, no e-mail e no portal', async () => {
    await agent
      .patch(`/api/rmas/${number}/assignee`)
      .send({ assigneeId: agentId, expectedAssigneeId: null })
      .expect(200);
    const [notice] = await noticesTo(CLIENT, 'rma_responsavel');
    expect(notice.payload).toMatchObject({
      assigneeName: 'Bruno Agente',
      link: expect.stringContaining(`/atendimentos/${number}`),
    });
    const portal = (await client.get(`/api/portal/rmas/${number}`).expect(200))
      .body as PortalRmaDetail;
    expect(portal.assignee).toEqual({ name: 'Bruno Agente' });

    // Liberar o chamado não manda aviso ao cliente.
    await agent
      .patch(`/api/rmas/${number}/assignee`)
      .send({ assigneeId: null, expectedAssigneeId: agentId })
      .expect(200);
    expect(await noticesTo(CLIENT, 'rma_responsavel')).toHaveLength(1);
  });

  it('cancelamento chega ao cliente e ao setor, com o motivo', async () => {
    await agent
      .post(`/api/rmas/${number}/cancellation`)
      .send({ reason: 'Cliente desistiu da manutenção' })
      .expect(201);
    expect(await noticesTo(CLIENT, 'rma_cancelado')).toHaveLength(1);
    const [toTeam] = await noticesTo(INBOX, 'equipe_rma');
    expect(toTeam.payload).toMatchObject({
      event: 'cancelado',
      reason: 'Cliente desistiu da manutenção',
    });
  });
});
