import type { InvoiceValidationView, StoredFileView } from '@central/contracts';
import { nfeXml } from './fixtures.js';
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
import { TEST_ENV } from '../vitest.config.e2e.js';

const FACTORY = TEST_ENV.INVOICE_RECIPIENT_DOCUMENT;

describe('Validação do XML da nota (P04)', () => {
  let ctx: TestContext;
  let client: TestAgent;
  let customerDocument: string;
  let customerId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    customerDocument = cnpj('111111110001');
    ({ customerId } = await createCustomer(ctx.db, {
      document: customerDocument,
      name: 'Cliente Um',
      contactEmail: 'cliente@um.local',
      portal: true,
    }));
    client = await signIn(ctx, 'cliente@um.local');
  });

  async function uploadXml(agent: TestAgent, content: Buffer): Promise<string> {
    const res = await agent
      .post('/api/files')
      .field('purpose', 'nota_xml')
      .attach('file', content, 'nota.xml')
      .expect(201);
    return (res.body as StoredFileView).id;
  }

  const validateFile = (agent: TestAgent, body: object) =>
    agent.post('/api/invoice-validations').send(body);

  it('valida contra o cadastro do cliente e devolve o arquivo exato', async () => {
    const fileId = await uploadXml(
      client,
      nfeXml({ issuerDocument: customerDocument, recipientDocument: FACTORY }),
    );
    const res = await validateFile(client, { fileId }).expect(200);
    const view = res.body as InvoiceValidationView;
    expect(view).toMatchObject({ fileId, status: 'valido', issues: [] });
    expect(view.invoice).toMatchObject({
      number: '4521',
      issuerDocument: customerDocument,
    });
    expect(view.rulesVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('indica as divergências que bloqueiam a abertura', async () => {
    const fileId = await uploadXml(
      client,
      nfeXml({ issuerDocument: cnpj('999999990001') }),
    );
    const res = await validateFile(client, { fileId }).expect(200);
    const view = res.body as InvoiceValidationView;
    expect(view.status).toBe('com_divergencias');
    expect(view.issues.map((issue) => [issue.rule, issue.blocking])).toEqual([
      ['emitente_cliente', true],
      ['destinatario_fabrica', true],
    ]);
  });

  it('o cliente não valida arquivo de outra conta nem troca de cliente (CA04)', async () => {
    await createCustomer(ctx.db, {
      document: cnpj('222222220001'),
      name: 'Cliente Dois',
      contactEmail: 'cliente@dois.local',
      portal: true,
    });
    const other = await signIn(ctx, 'cliente@dois.local');
    const fileId = await uploadXml(
      other,
      nfeXml({ issuerDocument: customerDocument }),
    );

    await validateFile(client, { fileId }).expect(404);
    // O customerId enviado pelo portal é ignorado: vale o próprio cadastro.
    const own = await uploadXml(
      other,
      nfeXml({ issuerDocument: customerDocument, recipientDocument: FACTORY }),
    );
    const res = await validateFile(other, { fileId: own, customerId }).expect(
      200,
    );
    expect((res.body as InvoiceValidationView).status).toBe('com_divergencias');
  });

  it('a equipe informa o cliente; a consulta não valida (CA05)', async () => {
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
    const agent = await signIn(ctx, 'agente@central.local');
    const fileId = await uploadXml(
      agent,
      nfeXml({ issuerDocument: customerDocument, recipientDocument: FACTORY }),
    );
    const missing = await validateFile(agent, { fileId }).expect(400);
    expect(missing.body.error.issues[0].path).toBe('customerId');
    const res = await validateFile(agent, { fileId, customerId }).expect(200);
    expect((res.body as InvoiceValidationView).status).toBe('valido');

    await createAccount(ctx.db, {
      email: 'consulta@central.local',
      role: 'agente_consulta',
    });
    const reader = await signIn(ctx, 'consulta@central.local');
    await validateFile(reader, { fileId, customerId }).expect(403);
  });
});
