import type {
  RmaDetail,
  RmaInternalNoteView,
  RmaMessageView,
  RmaSummary,
} from '@central/contracts';
import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import {
  accounts,
  customerContacts,
  customerNotes,
  customers,
  files,
  legacyRecords,
  rmaInvoices,
  rmas,
  rmaShipmentItems,
} from '../src/database/schema/index.js';
import { importLegacy } from '../src/legacy-import/legacy-importer.js';
import type { ImportOptions } from '../src/legacy-import/import-context.js';
import type {
  LegacyFileContent,
  LegacySource,
  LegacyStaff,
  LegacyTicket,
  LegacyTicketDetails,
  LegacyUser,
} from '../src/legacy-import/legacy-source.js';
import { TEST_ENV } from '../vitest.config.e2e.js';
import { JPEG, nfeXml, PDF } from './fixtures.js';
import {
  cnpj,
  createAccount,
  createTestApp,
  MemoryFileStorage,
  PASSWORD,
  resetDatabase,
  signIn,
  type TestContext,
} from './support.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const CUSTOMER_CNPJ = cnpj('112223330001');
const CUSTOMER_CPF = '52998224725';
/** CNPJ que só aparece na NF do cliente, não no cadastro dele. */
const NF_ONLY_CNPJ = cnpj('556667770001');
const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 7, day, hour));

/** Legado sintético, no formato que a leitura do MariaDB entrega. */
class FakeLegacySource implements LegacySource {
  constructor(private readonly legacyHash: string) {}

  staff(): Promise<LegacyStaff[]> {
    const member = (
      id: number,
      email: string | null,
      extra: Partial<LegacyStaff> = {},
    ): LegacyStaff => ({
      id,
      name: `Agente ${id}`,
      email,
      passwordHash: this.legacyHash,
      isAdmin: false,
      isActive: true,
      createdAt: at(1),
      lastLoginAt: null,
      ...extra,
    });
    return Promise.resolve([
      member(3, 'admin.legado@central.local', { isAdmin: true }),
      // Caixa do setor no cadastro do agente: entra pelo e-mail da lista.
      member(4, TEST_ENV.MAINTENANCE_INBOX_EMAIL),
      member(5, null),
      member(7, 'antigo@central.local', { isActive: false }),
      // Conta compartilhada do setor, fora da lista: só assina o histórico.
      member(8, TEST_ENV.MAINTENANCE_INBOX_EMAIL, {
        name: 'Manutenção (setor)',
        isAdmin: true,
      }),
    ]);
  }

  users(): Promise<LegacyUser[]> {
    const user = (
      id: number,
      email: string,
      document: string | null,
      extra: Partial<LegacyUser> = {},
    ): LegacyUser => ({
      id,
      name: `Usuário ${id}`,
      email,
      document,
      phone: null,
      notes: null,
      organization: null,
      passwordHash: null,
      createdAt: at(2),
      ...extra,
    });
    return Promise.resolve([
      user(10, 'cliente.pf@exemplo.local', '529.982.247-25', {
        passwordHash: this.legacyHash,
        phone: '11 91234-5678',
      }),
      user(11, 'compras@alfa.local', CUSTOMER_CNPJ, {
        notes: 'Cliente desde 2020',
        organization: {
          name: 'Alfa',
          website: null,
          phone: null,
          address: null,
        },
        createdAt: at(1),
      }),
      user(12, 'ti@alfa.local', CUSTOMER_CNPJ),
      user(13, 'sem.documento@exemplo.local', '123'),
      user(14, 'admin.legado@central.local', '39053344705'),
      // Sem CPF/CNPJ no cadastro, mas com NF: o emitente identifica o cliente.
      user(15, 'compras@beta.local', null),
    ]);
  }

  tickets(): Promise<LegacyTicket[]> {
    const ticket = (
      id: number,
      userId: number,
      extra: Partial<LegacyTicket> = {},
    ): LegacyTicket => ({
      id,
      number: `000${id}`,
      userId,
      staffId: 0,
      subject: null,
      priority: null,
      observations: null,
      closed: false,
      closedAt: null,
      createdAt: at(3),
      updatedAt: at(20),
      ...extra,
    });
    return Promise.resolve([
      ticket(100, 11, {
        staffId: 4,
        priority: '3',
        subject: 'Leitores',
        observations: 'Urgente',
      }),
      ticket(101, 10, { closed: true, closedAt: at(25) }),
      ticket(102, 13),
      ticket(103, 10),
    ]);
  }

  ticketDetails(ticketId: number): Promise<LegacyTicketDetails> {
    const empty: LegacyTicketDetails = {
      equipment: [],
      events: [],
      photos: [],
      files: [],
      shipment: null,
      entries: [],
    };
    const equipment = (id: number, sequence: number, status: string) => ({
      id,
      sequence,
      model: `Modelo ${id}`,
      serialNumber: `S${id}`,
      summary: 'Não liga',
      details: null,
      description: '',
      status,
      warranty: id === 1 ? 'em_analise' : 'nao_solicitada',
      technicalReport: null,
      internalNote: null,
      createdAt: at(3),
      updatedAt: at(18),
    });
    const event = (
      id: number,
      equipmentId: number,
      toStatus: string,
      day: number,
    ) => ({
      id,
      equipmentId,
      fromStatus: null,
      toStatus,
      note: null,
      staffId: 4,
      createdAt: at(day),
    });
    const entry = (id: number, type: string, extra: object) => ({
      id,
      type,
      staffId: 0,
      userId: 0,
      poster: 'Equipe',
      body: '<p>Texto</p>',
      format: 'html',
      createdAt: at(4, id % 24),
      ...extra,
    });
    const details: Record<number, LegacyTicketDetails> = {
      100: {
        equipment: [
          equipment(1, 1, 'em_testes'),
          equipment(2, 2, 'aguardando_envio'),
          equipment(3, 3, 'concluido'),
        ],
        events: [
          event(1, 1, 'recebido', 5),
          event(2, 1, 'em_testes', 8),
          event(3, 3, 'recebido', 5),
          event(4, 3, 'concluido', 15),
        ],
        photos: [
          { id: 21, equipmentId: 1, fileId: 501, slot: 2 },
          { id: 22, equipmentId: 1, fileId: 502, slot: 1 },
          // O mesmo arquivo em outro equipamento: aqui vira uma cópia.
          { id: 23, equipmentId: 2, fileId: 501, slot: 1 },
        ],
        files: [
          {
            id: 31,
            fileId: 602,
            kind: 'nf',
            errors: 'Emitente divergente',
            invoiceNumber: '1',
            invoiceIssuerName: null,
            createdAt: at(3),
          },
          {
            id: 32,
            fileId: 601,
            kind: 'nf',
            errors: null,
            invoiceNumber: '4521',
            invoiceIssuerName: 'Alfa',
            createdAt: at(4),
          },
          {
            id: 33,
            fileId: 603,
            kind: 'dc',
            errors: null,
            invoiceNumber: null,
            invoiceIssuerName: null,
            createdAt: at(4),
          },
        ],
        shipment: {
          carrier: 'CORREIOS',
          trackingCode: 'BR123',
          confirmedAt: at(4),
          updatedAt: at(4),
        },
        entries: [
          entry(41, 'M', {
            userId: 12,
            body: '<p>Bom dia,<br>seguem os <b>leitores</b>.</p>',
          }),
          entry(42, 'R', { staffId: 4, body: '<p>Recebido, obrigado.</p>' }),
          entry(43, 'N', {
            staffId: 4,
            poster: 'Agente 4',
            body: 'Cliente pediu prioridade',
            format: 'text',
          }),
          entry(44, 'R', { staffId: 5, poster: 'Agente 5' }),
          entry(45, 'M', {
            userId: 11,
            body: 'palavra '.repeat(300),
            format: 'text',
          }),
          entry(46, 'R', { staffId: 8, body: '<p>Resposta do setor.</p>' }),
        ],
      },
      101: {
        ...empty,
        equipment: [equipment(5, 1, 'concluido')],
        files: [
          {
            id: 34,
            fileId: 604,
            kind: 'nf',
            errors: null,
            invoiceNumber: '777',
            invoiceIssuerName: 'Fábio',
            createdAt: at(3),
          },
        ],
      },
      103: {
        ...empty,
        equipment: [equipment(6, 1, 'extraviado')],
        photos: [{ id: 24, equipmentId: 6, fileId: 501, slot: 1 }],
      },
    };
    return Promise.resolve(details[ticketId] ?? empty);
  }

  invoiceFileIds(userId: number): Promise<number[]> {
    return Promise.resolve(userId === 15 ? [605] : []);
  }

  fileContent(fileId: number): Promise<LegacyFileContent | null> {
    const contents: Record<number, LegacyFileContent> = {
      501: { name: 'frente.jpg', content: JPEG },
      502: { name: 'etiqueta.png', content: PNG },
      601: {
        name: 'nota.xml',
        content: nfeXml({
          issuerDocument: CUSTOMER_CNPJ,
          recipientDocument: TEST_ENV.INVOICE_RECIPIENT_DOCUMENT,
        }),
      },
      602: {
        name: 'nota-antiga.xml',
        content: nfeXml({ issuerDocument: cnpj('999999990001') }),
      },
      603: { name: 'declaracao.pdf', content: PDF },
      // NF em PDF: não é o XML que o sistema valida.
      604: { name: 'nota.pdf', content: PDF },
      605: {
        name: 'nota-beta.xml',
        content: nfeXml({ issuerDocument: NF_ONLY_CNPJ }),
      },
    };
    return Promise.resolve(contents[fileId] ?? null);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

// Cada teste roda uma importação inteira (com hash de senha): mais tempo que o padrão.
describe(
  'Importação do sistema anterior (osTicket)',
  { timeout: 60_000 },
  () => {
    let ctx: TestContext;
    let source: FakeLegacySource;
    const options: ImportOptions = {
      dryRun: false,
      staffEmails: new Map([[4, 'agente.legado@central.local']]),
      maintenanceInbox: TEST_ENV.MAINTENANCE_INBOX_EMAIL,
      invoiceRecipientDocument: TEST_ENV.INVOICE_RECIPIENT_DOCUMENT,
      invoiceRecipientAddress: undefined,
      slaHours: 720,
      termsVersion: 'termo-teste',
    };
    const run = (
      overrides: Partial<ImportOptions> = {},
      storage = ctx.storage,
    ) => importLegacy(ctx.db, source, storage, { ...options, ...overrides });
    const total = async (
      table:
        typeof rmas | typeof accounts | typeof legacyRecords | typeof files,
    ) => (await ctx.db.select({ total: count() }).from(table))[0].total;

    beforeAll(async () => {
      ctx = await createTestApp();
      source = new FakeLegacySource(bcrypt.hashSync(PASSWORD, 4));
    });
    afterAll(() => ctx.app.close());
    beforeEach(async () => {
      await resetDatabase(ctx.db);
      ctx.storage.contents.clear();
    });

    it('o ensaio confere tudo e não grava nada', async () => {
      const report = await run({ dryRun: true }, new MemoryFileStorage());
      expect(report.imported.get('chamados')).toBe(2);
      expect(await total(accounts)).toBe(0);
      expect(await total(rmas)).toBe(0);
      expect(await total(legacyRecords)).toBe(0);
      expect(ctx.storage.contents.size).toBe(0);
    });

    it('depois do ensaio, a importação real começa no #100001', async () => {
      await run({ dryRun: true }, new MemoryFileStorage());
      await run();
      const numbers = await ctx.db
        .select({ number: rmas.number })
        .from(rmas)
        .orderBy(rmas.number);
      expect(numbers.map((row) => row.number)).toEqual([100001, 100002]);
    });

    it('importa equipe, clientes e chamados, com o relatório do que ficou de fora', async () => {
      const report = await run();
      expect(Object.fromEntries(report.imported)).toMatchObject({
        equipe: 4,
        clientes: 3,
        contatos: 4,
        chamados: 2,
        equipamentos: 4,
        fotos: 3,
        documentos: 2,
        envios: 1,
        histórico: 4,
      });
      const issues = report.issues.map(
        (issue) => `${issue.level} ${issue.source}`,
      );
      expect(issues).toEqual(
        expect.arrayContaining([
          'ignorado ost_staff 5',
          'ignorado ost_user 13',
          'ignorado ost_user 14',
          'ignorado ticket 000102',
          'falha ticket 000103',
          'aviso ticket 000101',
        ]),
      );
      // O ticket que falhou não deixa chamado nem arquivo para trás.
      expect(ctx.storage.contents.size).toBe(await total(files));
    });

    it('agentes: o e-mail próprio substitui a caixa do setor e o inativo entra desativado', async () => {
      await run();
      const rows = await ctx.db
        .select({
          email: accounts.email,
          role: accounts.role,
          status: accounts.status,
        })
        .from(accounts)
        .where(eq(accounts.role, 'agente'));
      expect(rows).toEqual(
        expect.arrayContaining([
          {
            email: 'agente.legado@central.local',
            role: 'agente',
            status: 'ativa',
          },
          {
            email: 'antigo@central.local',
            role: 'agente',
            status: 'desativada',
          },
        ]),
      );
      expect(rows.map((row) => row.email)).not.toContain(
        TEST_ENV.MAINTENANCE_INBOX_EMAIL,
      );
    });

    it('a conta da caixa do setor entra desativada e as respostas dela seguem na conversa', async () => {
      const report = await run();
      expect(report.issues).toContainEqual(
        expect.objectContaining({ level: 'aviso', source: 'ost_staff 8' }),
      );
      const [sector] = await ctx.db
        .select()
        .from(accounts)
        .where(eq(accounts.email, TEST_ENV.MAINTENANCE_INBOX_EMAIL));
      expect(sector).toMatchObject({
        name: 'Manutenção (setor)',
        status: 'desativada',
      });
      expect(sector.passwordHash.startsWith('$argon2id$')).toBe(true);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: TEST_ENV.MAINTENANCE_INBOX_EMAIL, password: PASSWORD })
        .expect(401);

      await createAccount(ctx.db, {
        email: 'conferencia@central.local',
        role: 'agente',
      });
      const agent = await signIn(ctx, 'conferencia@central.local');
      const [rma] = await ctx.db
        .select({ number: rmas.number })
        .from(rmas)
        .orderBy(rmas.createdAt);
      const messages = (
        await agent.get(`/api/rmas/${rma.number}/messages`).expect(200)
      ).body as RmaMessageView[];
      expect(messages.at(-1)).toMatchObject({
        side: 'equipe',
        authorName: 'Manutenção (setor)',
        body: 'Resposta do setor.',
      });
    });

    it('sem CPF/CNPJ no cadastro, o cliente é identificado pelo emitente da NF', async () => {
      const report = await run();
      expect(report.issues).toContainEqual(
        expect.objectContaining({ level: 'aviso', source: 'ost_user 15' }),
      );
      const [customer] = await ctx.db
        .select({ kind: customers.kind, name: customers.name })
        .from(customers)
        .where(eq(customers.document, NF_ONLY_CNPJ));
      expect(customer).toEqual({ kind: 'pessoa_juridica', name: 'Usuário 15' });
    });

    it('o mesmo CNPJ vira um cliente com dois contatos e as observações internas', async () => {
      await run();
      const [customer] = await ctx.db
        .select()
        .from(customers)
        .where(eq(customers.document, CUSTOMER_CNPJ));
      expect(customer).toMatchObject({
        kind: 'pessoa_juridica',
        name: 'Usuário 11',
      });
      const contacts = await ctx.db
        .select({ email: customerContacts.email })
        .from(customerContacts)
        .where(eq(customerContacts.customerId, customer.id));
      expect(contacts.map((contact) => contact.email).sort()).toEqual([
        'compras@alfa.local',
        'ti@alfa.local',
      ]);
      const [notes] = await ctx.db
        .select()
        .from(customerNotes)
        .where(eq(customerNotes.customerId, customer.id));
      expect(notes.body).toContain('Organização no sistema anterior: Alfa');
      const [person] = await ctx.db
        .select({ phone: customerContacts.phone })
        .from(customerContacts)
        .where(eq(customerContacts.email, 'cliente.pf@exemplo.local'));
      expect(person.phone).toBe('+55 (11) 9 1234-5678');
      // O cliente importado conta com o termo vigente aceito (08/10/2026).
      const [account] = await ctx.db
        .select({ termsVersion: accounts.termsVersion })
        .from(accounts)
        .where(eq(accounts.email, 'cliente.pf@exemplo.local'));
      expect(account.termsVersion).toBe('termo-teste');
    });

    it('o chamado aparece pelo número antigo, com etapas, fotos, documentos e envio', async () => {
      await run();
      await createAccount(ctx.db, {
        email: 'conferencia@central.local',
        role: 'agente',
      });
      const agent = await signIn(ctx, 'conferencia@central.local');
      const list = (await agent.get('/api/rmas?search=000100').expect(200))
        .body as { items: RmaSummary[] };
      expect(list.items).toHaveLength(1);
      const [summary] = list.items;
      expect(summary).toMatchObject({
        legacyNumber: '000100',
        priority: 'alta',
        documentationPending: null,
      });

      const detail = (
        await agent.get(`/api/rmas/${summary.number}`).expect(200)
      ).body as RmaDetail;
      expect(
        detail.items.map((item) => [item.stage, item.photos.length]),
      ).toEqual([
        ['testes', 2],
        ['aguardando_envio', 1],
        ['finalizado', 0],
      ]);
      expect(detail.items[0].warranty).toBe('em_analise');
      expect(detail.documents.map((document) => document.kind).sort()).toEqual([
        'declaracao',
        'nota_xml',
      ]);
      expect(detail.invoices).toEqual([
        expect.objectContaining({
          number: '4521',
          issuerDocument: CUSTOMER_CNPJ,
        }),
      ]);
      expect(detail.assignee?.name).toBe('Agente 4');
      const shipped = await ctx.db.select().from(rmaShipmentItems);
      expect(shipped).toHaveLength(2);
    });

    it('a conversa chega como texto, com as notas internas separadas', async () => {
      await run();
      await createAccount(ctx.db, {
        email: 'conferencia@central.local',
        role: 'agente',
      });
      const agent = await signIn(ctx, 'conferencia@central.local');
      const [rma] = await ctx.db
        .select({ number: rmas.number })
        .from(rmas)
        .orderBy(rmas.createdAt);
      const messages = (
        await agent.get(`/api/rmas/${rma.number}/messages`).expect(200)
      ).body as RmaMessageView[];
      expect(messages[0].body).toBe(
        'Assunto: Leitores\n\nObservações: Urgente',
      );
      expect(messages[1]).toMatchObject({
        side: 'cliente',
        authorName: 'Usuário 12',
        body: 'Bom dia,\nseguem os leitores.',
      });
      expect(messages[2]).toMatchObject({
        side: 'equipe',
        body: 'Recebido, obrigado.',
      });
      // A mensagem de 2.400 caracteres foi dividida, sem perder nada.
      expect(messages).toHaveLength(6);

      const notes = (
        await agent.get(`/api/rmas/${rma.number}/internal-notes`).expect(200)
      ).body as RmaInternalNoteView[];
      expect(notes.map((note) => note.authorName)).toEqual([
        'Agente 4',
        'Agente 5',
      ]);
      expect(notes[1].body).toContain(
        'Resposta enviada ao cliente no sistema anterior',
      );
    });

    it('a NF em PDF entra só com os dados da nota, e o chamado encerrado não fica pendente', async () => {
      await run();
      const [closed] = await ctx.db
        .select({ id: rmas.id, closedAt: rmas.closedAt })
        .from(rmas)
        .where(
          eq(
            rmas.customerId,
            (
              await ctx.db
                .select({ id: customers.id })
                .from(customers)
                .where(eq(customers.document, CUSTOMER_CPF))
            )[0].id,
          ),
        );
      expect(closed.closedAt).toEqual(at(25));
      const invoices = await ctx.db
        .select()
        .from(rmaInvoices)
        .where(eq(rmaInvoices.rmaId, closed.id));
      expect(invoices).toEqual([
        expect.objectContaining({
          number: '777',
          documentId: null,
          issuerDocument: CUSTOMER_CPF,
        }),
      ]);
    });

    it('rodar de novo não duplica nada', async () => {
      await run();
      const before = await Promise.all([
        total(accounts),
        total(rmas),
        total(files),
        total(legacyRecords),
      ]);
      const again = await run();
      expect(again.imported.get('chamados')).toBeUndefined();
      expect(again.alreadyImported.get('chamados')).toBe(2);
      expect(
        await Promise.all([
          total(accounts),
          total(rmas),
          total(files),
          total(legacyRecords),
        ]),
      ).toEqual(before);
    });

    it('cliente e agente entram com a senha do sistema anterior', async () => {
      await run();
      await signIn(ctx, 'cliente.pf@exemplo.local');
      await signIn(ctx, 'admin.legado@central.local');
      const [client] = await ctx.db
        .select({ hash: accounts.passwordHash })
        .from(accounts)
        .where(eq(accounts.email, 'cliente.pf@exemplo.local'));
      expect(client.hash.startsWith('$argon2id$')).toBe(true);
    });
  },
);
