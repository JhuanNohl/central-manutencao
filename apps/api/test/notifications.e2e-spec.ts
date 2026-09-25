import { eq } from 'drizzle-orm';
import { invitations, notifications } from '../src/database/schema/index.js';
import {
  createAccount,
  createTestApp,
  resetDatabase,
  signIn,
  type TestAgent,
  type TestContext,
} from './support.js';

describe('Avisos por e-mail (fila durável)', () => {
  let ctx: TestContext;
  let admin: TestAgent;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.mail.sent = [];
    ctx.mail.failing = false;
    await createAccount(ctx.db, {
      email: 'admin@central.local',
      role: 'administrador',
    });
    admin = await signIn(ctx, 'admin@central.local');
  });

  /** Faz a próxima tentativa ficar elegível sem esperar o intervalo de espera. */
  const makeDue = () =>
    ctx.db
      .update(notifications)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) });

  it('envia e remove o link com token do registro após o envio', async () => {
    await admin
      .post('/api/invitations/staff')
      .send({ email: 'novo@central.local', role: 'agente' })
      .expect(201);
    expect(await ctx.processor.processBatch()).toBe(1);

    expect(ctx.mail.sent).toHaveLength(1);
    expect(ctx.mail.sent[0].html).toContain('Aceitar convite');
    const [row] = await ctx.db.select().from(notifications);
    expect(row).toMatchObject({ status: 'enviada', attempts: 1 });
    expect(JSON.stringify(row.payload)).not.toContain('#token=');

    // Nada mais a processar: não reenvia.
    expect(await ctx.processor.processBatch()).toBe(0);
  });

  it('CA18 — falha de SMTP preserva a operação e deixa o aviso recuperável', async () => {
    ctx.mail.failing = true;
    const res = await admin
      .post('/api/invitations/staff')
      .send({ email: 'novo@central.local', role: 'agente' })
      .expect(201);

    await ctx.processor.processBatch();
    let [row] = await ctx.db.select().from(notifications);
    expect(row).toMatchObject({ status: 'pendente', attempts: 1 });
    expect(row.lastError).toContain('SMTP indisponível');
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Tentativas esgotadas (limite de teste = 2): falha identificável.
    await makeDue();
    await ctx.processor.processBatch();
    [row] = await ctx.db.select().from(notifications);
    expect(row).toMatchObject({ status: 'falhou', attempts: 2 });

    // O convite continua válido.
    const [invitation] = await ctx.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, res.body.id));
    expect(invitation.revokedAt).toBeNull();

    const failed = await admin
      .get('/api/admin/notifications?status=falhou')
      .expect(200);
    expect(failed.body.items).toHaveLength(1);
    expect(failed.body.items[0]).not.toHaveProperty('payload');

    // Recuperação manual após o SMTP voltar.
    ctx.mail.failing = false;
    await admin.post(`/api/admin/notifications/${row.id}/retry`).expect(200);
    await ctx.processor.processBatch();
    [row] = await ctx.db.select().from(notifications);
    expect(row).toMatchObject({ status: 'enviada', attempts: 3 });
    expect(ctx.mail.sent).toHaveLength(1);
  });

  it('somente avisos com falha podem ser reagendados', async () => {
    await admin
      .post('/api/invitations/staff')
      .send({ email: 'novo@central.local', role: 'agente' })
      .expect(201);
    const [row] = await ctx.db.select().from(notifications);
    await admin.post(`/api/admin/notifications/${row.id}/retry`).expect(409);
  });

  it('processamentos concorrentes não enviam o mesmo aviso duas vezes', async () => {
    for (const email of [
      'a@central.local',
      'b@central.local',
      'c@central.local',
    ]) {
      await admin
        .post('/api/invitations/staff')
        .send({ email, role: 'agente' })
        .expect(201);
    }
    const processed = await Promise.all([
      ctx.processor.processBatch(),
      ctx.processor.processBatch(),
      ctx.processor.processBatch(),
    ]);
    expect(processed.reduce((a, b) => a + b, 0)).toBe(3);
    expect(ctx.mail.sent).toHaveLength(3);
  });

  it('agente não acessa a administração de avisos', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    await agent.get('/api/admin/notifications').expect(403);
  });
});
