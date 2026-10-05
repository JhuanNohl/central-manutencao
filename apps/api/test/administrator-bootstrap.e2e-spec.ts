import { eq } from 'drizzle-orm';
import { accounts, auditEvents } from '../src/database/schema/index.js';
import { createAdministrator } from '../src/identity/administrator-bootstrap.js';
import { temporaryCredentials } from '../src/common/crypto/passwords.js';
import { createTestApp, resetDatabase, type TestContext } from './support.js';

describe('Primeiro administrador de um ambiente novo', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(() => resetDatabase(ctx.db));

  const input = { email: 'admin@empresa.local', name: 'Admin Inicial' };

  it('cria o administrador com senha provisória, auditado e sem ator', async () => {
    const credentials = await temporaryCredentials();
    const id = await createAdministrator(ctx.db, input, credentials);

    const [account] = await ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id));
    expect(account).toMatchObject({
      role: 'administrador',
      passwordChangeRequired: true,
    });
    const [audit] = await ctx.db.select().from(auditEvents);
    expect(audit).toMatchObject({
      action: 'conta.administrador_inicial_criado',
      actorAccountId: null,
      entityId: id,
    });

    // Entra com a senha provisória, mas só pode trocá-la.
    const agent = ctx.http();
    await agent
      .post('/api/auth/login')
      .send({ email: input.email, password: credentials.temporaryPassword })
      .expect(200);
    const blocked = await agent.get('/api/accounts').expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('não cria um segundo administrador com o mesmo e-mail', async () => {
    await createAdministrator(ctx.db, input, await temporaryCredentials());
    await expect(
      createAdministrator(ctx.db, input, await temporaryCredentials()),
    ).rejects.toThrow('Este e-mail já possui conta.');
  });
});
