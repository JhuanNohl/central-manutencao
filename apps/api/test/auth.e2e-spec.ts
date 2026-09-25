import { eq } from 'drizzle-orm';
import {
  accounts,
  auditEvents,
  customers,
  notifications,
  sessions,
} from '../src/database/schema/index.js';
import {
  cnpj,
  createAccount,
  createTestApp,
  PASSWORD,
  resetDatabase,
  signIn,
  type TestContext,
} from './support.js';

const registration = (overrides: Record<string, unknown> = {}) => ({
  customer: {
    kind: 'pessoa_juridica',
    name: 'Cliente Autocadastro Ltda.',
    document: '11.222.333/0001-81',
  },
  contact: { name: 'Maria Solicitante', phone: '(11) 90000-0000' },
  email: 'Maria@Cliente.Local',
  password: PASSWORD,
  ...overrides,
});

describe('Autenticação e sessão', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.mail.sent = [];
    ctx.mail.failing = false;
  });

  it('autocadastro cria cliente, contato e conta, e já autentica', async () => {
    const agent = ctx.http();
    const res = await agent
      .post('/api/auth/register')
      .send(registration())
      .expect(201);

    expect(res.body.account).toMatchObject({
      email: 'maria@cliente.local',
      role: 'cliente',
      emailVerified: false,
      customer: { name: 'Cliente Autocadastro Ltda.' },
    });
    expect(res.body.account.permissions).toEqual([
      'rma.own.read',
      'rma.own.create',
    ]);

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/central_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.account.email).toBe('maria@cliente.local');

    const [customer] = await ctx.db.select().from(customers);
    expect(customer.document).toBe('11222333000181');

    const [verification] = await ctx.db.select().from(notifications);
    expect(verification).toMatchObject({
      template: 'confirmacao_email',
      recipient: 'maria@cliente.local',
      status: 'pendente',
    });
    const [audit] = await ctx.db.select().from(auditEvents);
    expect(audit.action).toBe('conta.autocadastro');
  });

  it('recusa documento inválido com o campo indicado', async () => {
    const res = await ctx
      .http()
      .post('/api/auth/register')
      .send(
        registration({
          customer: {
            kind: 'pessoa_juridica',
            name: 'X Ltda.',
            document: '11222333000180',
          },
        }),
      )
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.issues).toContainEqual({
      path: 'customer.document',
      message: 'CNPJ inválido',
    });
  });

  it('não vincula o autocadastro a um cliente já existente', async () => {
    await ctx
      .http()
      .post('/api/auth/register')
      .send(registration())
      .expect(201);
    const res = await ctx
      .http()
      .post('/api/auth/register')
      .send(registration({ email: 'outra@pessoa.local' }))
      .expect(409);
    expect(res.body.error.issues[0].path).toBe('customer.document');
    expect(await ctx.db.select().from(accounts)).toHaveLength(1);
  });

  it('recusa e-mail já cadastrado sem deixar registros parciais', async () => {
    await createAccount(ctx.db, {
      email: 'maria@cliente.local',
      role: 'agente',
    });
    await ctx
      .http()
      .post('/api/auth/register')
      .send(registration())
      .expect(409);
    expect(await ctx.db.select().from(customers)).toHaveLength(0);
  });

  it('cadastros simultâneos do mesmo e-mail criam uma única conta', async () => {
    const results = await Promise.all([
      ctx.http().post('/api/auth/register').send(registration()),
      ctx
        .http()
        .post('/api/auth/register')
        .send(
          registration({
            customer: {
              kind: 'pessoa_juridica',
              name: 'Outra',
              document: cnpj('987654320001'),
            },
          }),
        ),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await ctx.db.select().from(accounts)).toHaveLength(1);
    expect(await ctx.db.select().from(customers)).toHaveLength(1);
  });

  it('login com senha errada ou e-mail inexistente dá a mesma resposta', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const wrong = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'agente@central.local', password: 'errada-errada' })
      .expect(401);
    const missing = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'ninguem@central.local', password: 'errada-errada' })
      .expect(401);
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(missing.body.error.message).toBe(wrong.body.error.message);
  });

  it('logout revoga a sessão no servidor', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
    const [session] = await ctx.db.select().from(sessions);
    expect(session.revokedAt).not.toBeNull();
  });

  it('o banco guarda apenas o hash do token de sessão', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const res = await ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'agente@central.local', password: PASSWORD });
    const token = String(res.headers['set-cookie']).match(
      /central_sid=([^;]+)/,
    )![1];
    const [session] = await ctx.db.select().from(sessions);
    expect(session.id).not.toBe(token);
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('recusa alteração de estado vinda de outra origem (CSRF)', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    const res = await agent
      .post('/api/auth/logout')
      .set('Origin', 'https://site-malicioso.example')
      .expect(403);
    expect(res.body.error.code).toBe('INVALID_ORIGIN');
    await agent.get('/api/auth/me').expect(200);
  });

  describe('redefinição de senha', () => {
    it('não revela se o e-mail existe', async () => {
      await ctx
        .http()
        .post('/api/auth/password-reset/request')
        .send({ email: 'ninguem@central.local' })
        .expect(202);
      expect(await ctx.db.select().from(notifications)).toHaveLength(0);
    });

    it('redefine uma única vez e encerra as sessões abertas', async () => {
      await createAccount(ctx.db, {
        email: 'agente@central.local',
        role: 'agente',
      });
      const oldSession = await signIn(ctx, 'agente@central.local');

      await ctx
        .http()
        .post('/api/auth/password-reset/request')
        .send({ email: 'agente@central.local' })
        .expect(202);
      await ctx.processor.processBatch();
      const token = ctx.mail.tokenFor('agente@central.local');

      await ctx
        .http()
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'nova-senha-segura' })
        .expect(204);
      await oldSession.get('/api/auth/me').expect(401);

      const reused = await ctx
        .http()
        .post('/api/auth/password-reset/confirm')
        .send({ token, password: 'outra-senha-segura' })
        .expect(400);
      expect(reused.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');

      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'agente@central.local', password: 'nova-senha-segura' })
        .expect(200);
    });

    it('um pedido novo invalida o link anterior', async () => {
      await createAccount(ctx.db, {
        email: 'agente@central.local',
        role: 'agente',
      });
      const requestReset = () =>
        ctx
          .http()
          .post('/api/auth/password-reset/request')
          .send({ email: 'agente@central.local' })
          .expect(202);

      await requestReset();
      await ctx.processor.processBatch();
      const first = ctx.mail.tokenFor('agente@central.local');
      await requestReset();

      await ctx
        .http()
        .post('/api/auth/password-reset/confirm')
        .send({ token: first, password: 'nova-senha-segura' })
        .expect(400);
    });
  });

  it('confirma o e-mail pelo link enviado no autocadastro', async () => {
    const agent = ctx.http();
    await agent.post('/api/auth/register').send(registration()).expect(201);
    await ctx.processor.processBatch();
    const token = ctx.mail.tokenFor('maria@cliente.local');

    await ctx
      .http()
      .post('/api/auth/email-verification/confirm')
      .send({ token })
      .expect(204);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.account.emailVerified).toBe(true);
  });

  it('troca de senha exige a senha atual e mantém só a sessão corrente', async () => {
    const id = await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const current = await signIn(ctx, 'agente@central.local');
    const other = await signIn(ctx, 'agente@central.local');

    await current
      .post('/api/auth/password')
      .send({ currentPassword: 'errada', newPassword: 'nova-senha-segura' })
      .expect(400);
    await current
      .post('/api/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: 'nova-senha-segura' })
      .expect(204);

    await current.get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
    const active = await ctx.db
      .select()
      .from(sessions)
      .where(eq(sessions.accountId, id));
    expect(active.filter((s) => s.revokedAt === null)).toHaveLength(1);
  });
});
