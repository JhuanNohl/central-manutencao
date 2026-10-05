import { eq } from 'drizzle-orm';
import {
  accounts,
  customerContacts,
  invitations,
  notifications,
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

describe('Acesso ao portal criado pela equipe, com senha provisória', () => {
  let ctx: TestContext;
  let agent: TestAgent;
  let customerId: string;
  let contactId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    ctx.mail.sent = [];
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    agent = await signIn(ctx, 'agente@central.local');
    ({ customerId, contactId } = await createCustomer(ctx.db, {
      name: 'Cliente Novo',
      document: cnpj('445566770001'),
      contactEmail: 'contato@novo.local',
    }));
  });

  const grant = (who: TestAgent = agent, contact = contactId) =>
    who.post(`/api/customers/${customerId}/contacts/${contact}/access`);

  /** A senha provisória chega no e-mail enviado ao contato. */
  async function temporaryPassword(): Promise<string> {
    await ctx.processor.processBatch();
    const mail = ctx.mail.sent.find((m) => m.to === 'contato@novo.local');
    const password = mail?.text.match(/Senha provisória: (\S+)/)?.[1];
    if (!password) throw new Error('Senha provisória não enviada.');
    return password;
  }

  it('cria a conta do contato e envia a senha provisória, que sai do banco após o envio', async () => {
    const res = await grant().expect(201);
    expect(res.body).toMatchObject({
      email: 'contato@novo.local',
      hasPortalAccess: true,
    });
    const password = await temporaryPassword();
    expect(password).toMatch(/^[A-Za-z2-9]{12}$/);

    const [account] = await ctx.db
      .select()
      .from(accounts)
      .where(eq(accounts.email, 'contato@novo.local'));
    expect(account).toMatchObject({
      role: 'cliente',
      passwordChangeRequired: true,
      emailVerifiedAt: null,
    });
    const [contact] = await ctx.db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.id, contactId));
    expect(contact.accountId).toBe(account.id);

    const [notice] = await ctx.db.select().from(notifications);
    expect(notice.template).toBe('acesso_portal');
    expect(JSON.stringify(notice.payload)).not.toContain(password);
  });

  it('no primeiro acesso, só a troca de senha é liberada', async () => {
    await grant().expect(201);
    const password = await temporaryPassword();
    const client = ctx.http();
    const login = await client
      .post('/api/auth/login')
      .send({ email: 'contato@novo.local', password })
      .expect(200);
    expect(login.body.account.passwordChangeRequired).toBe(true);

    await client.get('/api/auth/me').expect(200);
    const blocked = await client.get('/api/portal/rmas').expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await client
      .post('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'Minha-senha-nova-1' })
      .expect(204);
    const me = await client.get('/api/auth/me').expect(200);
    expect(me.body.account).toMatchObject({
      passwordChangeRequired: false,
      emailVerified: true,
    });
    await client.get('/api/portal/rmas').expect(200);
  });

  it('um convite antigo em aberto deixa de valer', async () => {
    await ctx.db.insert(invitations).values({
      tokenHash: 'hash-de-teste',
      email: 'contato@novo.local',
      role: 'cliente',
      customerContactId: contactId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await grant().expect(201);
    const [invitation] = await ctx.db.select().from(invitations);
    expect(invitation.revokedAt).not.toBeNull();
  });

  it('recusa contato que já tem acesso, de outro cliente ou sem permissão', async () => {
    await grant().expect(201);
    await grant().expect(409);

    const other = await createCustomer(ctx.db, {
      name: 'Outro',
      document: cnpj('222222220001'),
      contactEmail: 'b@b.local',
    });
    await grant(agent, other.contactId).expect(404);

    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const reader = await signIn(ctx, 'consulta@central.local');
    await grant(reader).expect(403);
  });

  describe('cadastro de cliente pela equipe', () => {
    const newCustomer = (email: string, document = '11222333000181') => ({
      customer: { kind: 'pessoa_juridica', name: 'Empresa Nova', document },
      contact: {
        name: 'Rita Compras',
        email,
        phone: '(31) 98888-7777',
      },
    });

    it('cria cliente, contato e acesso, e avisa que o cadastro foi interno', async () => {
      const res = await agent
        .post('/api/customers')
        .send(newCustomer('Rita@Empresa.local'))
        .expect(201);
      expect(res.body.contacts).toEqual([
        expect.objectContaining({
          name: 'Rita Compras',
          email: 'rita@empresa.local',
          phone: '+55 (31) 9 8888-7777',
          hasPortalAccess: true,
        }),
      ]);
      const [account] = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.email, 'rita@empresa.local'));
      expect(account).toMatchObject({
        role: 'cliente',
        passwordChangeRequired: true,
      });

      await ctx.processor.processBatch();
      const mail = ctx.mail.sent.find((m) => m.to === 'rita@empresa.local');
      expect(mail?.text).toContain('O cadastro foi feito internamente');
      expect(mail?.text).toContain('Empresa Nova');
      expect(mail?.text).toMatch(/Senha provisória: \S+/);
    });

    it('e-mail que já tem conta não grava nada e aponta o campo do contato', async () => {
      await createAccount(ctx.db, { email: 'ja@existe.local', role: 'agente' });
      const res = await agent
        .post('/api/customers')
        .send(newCustomer('ja@existe.local'))
        .expect(409);
      expect(res.body.error.issues).toEqual([
        { path: 'contact.email', message: 'E-mail já cadastrado' },
      ]);
      const created = await ctx.db
        .select()
        .from(customerContacts)
        .where(eq(customerContacts.email, 'ja@existe.local'));
      expect(created).toHaveLength(0);
    });

    it('telefone fora do formato brasileiro é recusado', async () => {
      const body = newCustomer('outra@empresa.local');
      body.contact.phone = '1234';
      const res = await agent.post('/api/customers').send(body).expect(400);
      expect(res.body.error.issues[0].path).toBe('contact.phone');
    });
  });
});
