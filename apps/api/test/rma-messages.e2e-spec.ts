import type { RmaMessageView } from '@central/contracts';
import { eq } from 'drizzle-orm';
import { notifications, rmas } from '../src/database/schema/index.js';
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

describe('Conversa do chamado entre cliente e equipe', () => {
  let ctx: TestContext;
  let agent: TestAgent;
  let reader: TestAgent;
  let client: TestAgent;
  let otherClient: TestAgent;
  let agentId: string;
  let number: number;

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
    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const { customerId, contactId } = await createCustomer(ctx.db, {
      document: cnpj('111111110001'),
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    });
    await createCustomer(ctx.db, {
      document: cnpj('222222220001'),
      name: 'Cliente Dois',
      contactEmail: 'cliente@dois.local',
      portal: true,
    });
    agent = await signIn(ctx, 'agente@central.local');
    reader = await signIn(ctx, 'consulta@central.local');
    client = await signIn(ctx, 'cliente@um.local');
    otherClient = await signIn(ctx, 'cliente@dois.local');
    const [rma] = await ctx.db
      .insert(rmas)
      .values({ customerId, requesterContactId: contactId })
      .returning();
    number = rma.number;
  });

  const staffPath = () => `/api/rmas/${number}/messages`;
  const portalPath = () => `/api/portal/rmas/${number}/messages`;
  const noticesOf = async (template: string) =>
    (await ctx.db.select().from(notifications)).filter(
      (n) => n.template === template,
    );

  it('cliente e equipe trocam mensagens na ordem de envio', async () => {
    await client
      .post(portalPath())
      .send({ body: 'O visor quebrou no transporte?' })
      .expect(201);
    const reply = await agent
      .post(staffPath())
      .send({ body: '  Vamos conferir na chegada.  ' })
      .expect(201);
    expect(reply.body).toMatchObject({
      body: 'Vamos conferir na chegada.',
      side: 'equipe',
      authorName: 'Bruno Agente',
      mine: true,
    });

    const staff = (await agent.get(staffPath()).expect(200))
      .body as RmaMessageView[];
    expect(staff.map((m) => [m.side, m.mine])).toEqual([
      ['cliente', false],
      ['equipe', true],
    ]);
    // Agente somente consulta lê a conversa, mas não escreve.
    await reader.get(staffPath()).expect(200);
    await reader.post(staffPath()).send({ body: 'Oi' }).expect(403);
  });

  it('no portal, o cliente não vê o nome de quem responde pela equipe (RN11)', async () => {
    await agent
      .post(staffPath())
      .send({ body: 'Recebemos seu pedido.' })
      .expect(201);
    const portal = (await client.get(portalPath()).expect(200))
      .body as RmaMessageView[];
    expect(portal).toEqual([
      expect.objectContaining({
        side: 'equipe',
        authorName: null,
        mine: false,
      }),
    ]);
    expect(JSON.stringify(portal)).not.toContain(agentId);
  });

  it('outro cliente não alcança a conversa (CA04)', async () => {
    await otherClient.get(portalPath()).expect(404);
    await otherClient.post(portalPath()).send({ body: 'Oi' }).expect(404);
    await client.post(staffPath()).send({ body: 'Oi' }).expect(403);
  });

  it('recusa mensagem vazia ou longa demais', async () => {
    await client.post(portalPath()).send({ body: '   ' }).expect(400);
    await client
      .post(portalPath())
      .send({ body: 'x'.repeat(2001) })
      .expect(400);
  });

  it('avisa por e-mail o outro lado, uma vez por janela de conversa', async () => {
    await agent.post(staffPath()).send({ body: 'Primeira' }).expect(201);
    await agent.post(staffPath()).send({ body: 'Segunda' }).expect(201);
    const toClient = await noticesOf('rma_mensagem_equipe');
    expect(toClient).toHaveLength(1);
    expect(toClient[0].recipient).toBe('cliente@um.local');

    await ctx.processor.processBatch();
    const mail = ctx.mail.sent.find((m) => m.to === 'cliente@um.local');
    expect(mail?.text).toContain(`/atendimentos/${number}`);
    // O texto da conversa fica no sistema, não no e-mail.
    expect(mail?.text).not.toContain('Primeira');
  });

  it('mensagem do cliente avisa o responsável; sem responsável, ninguém', async () => {
    await client
      .post(portalPath())
      .send({ body: 'Alguma novidade?' })
      .expect(201);
    expect(await noticesOf('rma_mensagem_cliente')).toHaveLength(0);

    await ctx.db
      .update(rmas)
      .set({ assigneeAccountId: agentId })
      .where(eq(rmas.number, number));
    await ctx.db.delete(notifications);
    await client.post(portalPath()).send({ body: 'E agora?' }).expect(201);
    const [notice] = await noticesOf('rma_mensagem_cliente');
    expect(notice.recipient).toBe('agente@central.local');
    expect(notice.payload).toMatchObject({
      customerName: 'Cliente Um',
      link: expect.stringContaining(`/chamados/${number}`),
    });
  });
});
