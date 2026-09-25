import { auditEvents } from '../src/database/schema/index.js';
import { sql } from 'drizzle-orm';
import {
  cnpj,
  createAccount,
  createCustomer,
  createTestApp,
  resetDatabase,
  signIn,
  type TestContext,
} from './support.js';

describe('Autorização e escopo', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(() => resetDatabase(ctx.db));

  it('rotas protegidas exigem sessão', async () => {
    const res = await ctx.http().get('/api/customers').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('CA04 — cliente não consulta cadastro de outro cliente', async () => {
    const mine = await createCustomer(ctx.db, {
      name: 'Meu Cliente',
      document: cnpj('100000000001'),
      contactEmail: 'eu@meu.local',
      portal: true,
    });
    const other = await createCustomer(ctx.db, {
      name: 'Outro Cliente',
      document: cnpj('200000000001'),
      contactEmail: 'outro@outro.local',
      portal: true,
    });
    const customer = await signIn(ctx, 'eu@meu.local');

    const own = await customer
      .get(`/api/customers/${mine.customerId}`)
      .expect(200);
    expect(own.body.name).toBe('Meu Cliente');

    const denied = await customer
      .get(`/api/customers/${other.customerId}`)
      .expect(404);
    expect(JSON.stringify(denied.body)).not.toContain('Outro Cliente');

    await customer.get('/api/customers').expect(403);
  });

  it('CA05 — agente somente consulta lê, mas não altera', async () => {
    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const viewer = await signIn(ctx, 'consulta@central.local');
    const { customerId } = await createCustomer(ctx.db, {
      name: 'Cliente',
      document: cnpj('300000000001'),
      contactEmail: 'c@c.local',
    });

    await viewer.get('/api/customers').expect(200);
    await viewer.get(`/api/customers/${customerId}`).expect(200);
    await viewer
      .post('/api/customers')
      .send({ kind: 'pessoa_fisica', name: 'Novo', document: '529.982.247-25' })
      .expect(403);
    await viewer
      .post(`/api/customers/${customerId}/contacts`)
      .send({ name: 'Novo contato', email: 'novo@c.local' })
      .expect(403);
  });

  it('agente cadastra cliente e contato, com auditoria', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');

    const created = await agent
      .post('/api/customers')
      .send({
        kind: 'pessoa_fisica',
        name: 'Pessoa Física',
        document: '529.982.247-25',
      })
      .expect(201);
    await agent
      .post(`/api/customers/${created.body.id}/contacts`)
      .send({ name: 'Pessoa Física', email: 'PF@Exemplo.local' })
      .expect(201);
    await agent
      .post('/api/customers')
      .send({
        kind: 'pessoa_fisica',
        name: 'Duplicada',
        document: '52998224725',
      })
      .expect(409);

    const actions = (await ctx.db.select().from(auditEvents)).map(
      (e) => e.action,
    );
    expect(actions).toEqual(['cliente.criado', 'cliente.contato_adicionado']);
  });

  describe('administração de contas', () => {
    it('desativar conta encerra as sessões dela imediatamente', async () => {
      await createAccount(ctx.db, {
        email: 'admin@central.local',
        role: 'administrador',
      });
      const agentId = await createAccount(ctx.db, {
        email: 'agente@central.local',
        role: 'agente',
      });
      const admin = await signIn(ctx, 'admin@central.local');
      const agent = await signIn(ctx, 'agente@central.local');

      await admin
        .post(`/api/accounts/${agentId}/disable`)
        .send({ reason: 'Desligamento' })
        .expect(200);
      await agent.get('/api/auth/me').expect(401);
      const login = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'agente@central.local', password: 'senha-de-teste-123' })
        .expect(403);
      expect(login.body.error.message).toMatch(/desativada/);

      await admin
        .post(`/api/accounts/${agentId}/enable`)
        .send({ reason: 'Retorno' })
        .expect(200);
      await signIn(ctx, 'agente@central.local');
    });

    it('mudança de papel vale na próxima requisição', async () => {
      await createAccount(ctx.db, {
        email: 'admin@central.local',
        role: 'administrador',
      });
      const agentId = await createAccount(ctx.db, {
        email: 'agente@central.local',
        role: 'agente',
      });
      const admin = await signIn(ctx, 'admin@central.local');
      const agent = await signIn(ctx, 'agente@central.local');

      await admin
        .patch(`/api/accounts/${agentId}/role`)
        .send({ role: 'agente_consulta', reason: 'Somente acompanhamento' })
        .expect(200);
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.account.role).toBe('agente_consulta');
      expect(me.body.account.permissions).not.toContain('customers.write');

      const [event] = await ctx.db.select().from(auditEvents);
      expect(event).toMatchObject({
        action: 'conta.papel_alterado',
        reason: 'Somente acompanhamento',
        data: { before: 'agente', after: 'agente_consulta' },
      });
    });

    it('preserva ao menos um administrador ativo, mesmo com pedidos simultâneos', async () => {
      const a = await createAccount(ctx.db, {
        email: 'a@central.local',
        role: 'administrador',
      });
      const b = await createAccount(ctx.db, {
        email: 'b@central.local',
        role: 'administrador',
      });
      const adminA = await signIn(ctx, 'a@central.local');
      const adminB = await signIn(ctx, 'b@central.local');

      await adminA
        .post(`/api/accounts/${a}/disable`)
        .send({ reason: 'Teste' })
        .expect(409);

      const results = await Promise.all([
        adminA.post(`/api/accounts/${b}/disable`).send({ reason: 'Corrida' }),
        adminB.post(`/api/accounts/${a}/disable`).send({ reason: 'Corrida' }),
      ]);
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      // Uma desativação vence; a outra é recusada (ou vem de sessão já revogada).
      expect(statuses[0]).toBe(200);
      expect([401, 409]).toContain(statuses[1]);

      const [{ admins }] = await ctx.db
        .execute<{ admins: number }>(
          sql`select count(*)::int as admins from accounts where role = 'administrador' and status = 'ativa'`,
        )
        .then((r) => r.rows);
      expect(admins).toBe(1);
    });

    it('cliente e agente não listam contas', async () => {
      await createAccount(ctx.db, {
        email: 'agente@central.local',
        role: 'agente',
      });
      const agent = await signIn(ctx, 'agente@central.local');
      await agent.get('/api/accounts').expect(403);
    });
  });

  it('histórico de auditoria não pode ser alterado nem apagado', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    await agent
      .post('/api/customers')
      .send({ kind: 'pessoa_fisica', name: 'Pessoa', document: '52998224725' })
      .expect(201);

    await expect(
      ctx.db.execute(sql`update audit_events set action = 'x'`),
    ).rejects.toThrow();
    await expect(
      ctx.db.execute(sql`delete from audit_events`),
    ).rejects.toThrow();
    expect(await ctx.db.select().from(auditEvents)).toHaveLength(1);
  });
});
