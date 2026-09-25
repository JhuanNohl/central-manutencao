import { eq } from 'drizzle-orm';
import { customerContacts, invitations } from '../src/database/schema/index.js';
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

describe('Convites', () => {
  let ctx: TestContext;
  let admin: TestAgent;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.mail.sent = [];
    await createAccount(ctx.db, {
      email: 'admin@central.local',
      role: 'administrador',
    });
    admin = await signIn(ctx, 'admin@central.local');
  });

  async function inviteAgent(email = 'novo.agente@central.local') {
    const res = await admin
      .post('/api/invitations/staff')
      .send({ email, role: 'agente' })
      .expect(201);
    await ctx.processor.processBatch();
    return { invitation: res.body, token: ctx.mail.tokenFor(email) };
  }

  it('administrador convida agente; aceite cria a conta com o papel concedido', async () => {
    const { invitation, token } = await inviteAgent();
    expect(invitation).toMatchObject({ status: 'pendente', role: 'agente' });

    const preview = await ctx
      .http()
      .post('/api/invitations/lookup')
      .send({ token })
      .expect(200);
    expect(preview.body).toMatchObject({
      email: 'novo.agente@central.local',
      role: 'agente',
    });

    const agent = ctx.http();
    const accepted = await agent
      .post('/api/invitations/accept')
      .send({ token, name: 'Novo Agente', password: 'senha-do-agente' })
      .expect(200);
    expect(accepted.body.account).toMatchObject({
      role: 'agente',
      emailVerified: true,
      customer: null,
    });
    await agent.get('/api/auth/me').expect(200);

    const list = await admin.get('/api/invitations').expect(200);
    expect(list.body.items[0].status).toBe('aceito');
  });

  it('convite é de uso único, inclusive com aceites simultâneos', async () => {
    const { token } = await inviteAgent();
    const body = { token, name: 'Novo Agente', password: 'senha-do-agente' };
    const results = await Promise.all([
      ctx.http().post('/api/invitations/accept').send(body),
      ctx.http().post('/api/invitations/accept').send(body),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 400,
    ]);

    await ctx.http().post('/api/invitations/accept').send(body).expect(400);
  });

  it('convite expirado ou revogado não é aceito', async () => {
    const { invitation, token } = await inviteAgent();
    await ctx.db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, invitation.id));
    await ctx
      .http()
      .post('/api/invitations/lookup')
      .send({ token })
      .expect(400);

    const second = await inviteAgent('outro@central.local');
    await admin
      .post(`/api/invitations/${second.invitation.id}/revoke`)
      .expect(200);
    await ctx
      .http()
      .post('/api/invitations/accept')
      .send({ token: second.token, name: 'Outro', password: 'senha-do-agente' })
      .expect(400);
  });

  it('reenviar convite substitui o anterior em aberto', async () => {
    const first = await inviteAgent();
    const second = await inviteAgent();
    await ctx
      .http()
      .post('/api/invitations/lookup')
      .send({ token: first.token })
      .expect(400);
    await ctx
      .http()
      .post('/api/invitations/lookup')
      .send({ token: second.token })
      .expect(200);
  });

  it('não convida e-mail que já possui conta', async () => {
    await createAccount(ctx.db, {
      email: 'existente@central.local',
      role: 'agente',
    });
    await admin
      .post('/api/invitations/staff')
      .send({ email: 'existente@central.local', role: 'agente' })
      .expect(409);
  });

  it('agente não convida integrantes da equipe', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    const res = await agent
      .post('/api/invitations/staff')
      .send({ email: 'x@central.local', role: 'administrador' })
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('agente convida contato de cliente; aceite vincula a conta ao cliente', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    const { customerId, contactId } = await createCustomer(ctx.db, {
      name: 'Cliente Convidado',
      document: cnpj('445566770001'),
      contactEmail: 'contato@convidado.local',
    });

    await agent
      .post(`/api/customers/${customerId}/contacts/${contactId}/invitation`)
      .expect(201);
    await ctx.processor.processBatch();
    const token = ctx.mail.tokenFor('contato@convidado.local');
    expect(ctx.mail.sent.at(-1)!.text).toContain('Cliente Convidado');

    const accepted = await ctx
      .http()
      .post('/api/invitations/accept')
      .send({ token, name: 'Contato Convidado', password: 'senha-do-contato' })
      .expect(200);
    expect(accepted.body.account).toMatchObject({
      role: 'cliente',
      customer: { id: customerId, name: 'Cliente Convidado' },
    });

    const [contact] = await ctx.db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.id, contactId));
    expect(contact.accountId).toBe(accepted.body.account.id);

    await agent
      .post(`/api/customers/${customerId}/contacts/${contactId}/invitation`)
      .expect(409);
  });

  it('não convida contato informando cliente diferente do dono', async () => {
    const a = await createCustomer(ctx.db, {
      name: 'A',
      document: cnpj('111111110001'),
      contactEmail: 'a@a.local',
    });
    const b = await createCustomer(ctx.db, {
      name: 'B',
      document: cnpj('222222220001'),
      contactEmail: 'b@b.local',
    });
    await admin
      .post(`/api/customers/${a.customerId}/contacts/${b.contactId}/invitation`)
      .expect(404);
  });
});
