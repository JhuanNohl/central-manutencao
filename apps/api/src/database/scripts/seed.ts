/**
 * Dados sintéticos para desenvolvimento e homologação. Nunca roda em produção.
 * Uso: npm run db:seed  (para apagar antes: npm run db:seed -w @central/api -- --reset)
 *
 * Cada bloco só é inserido se a respectiva tabela estiver vazia, de modo que
 * rodar de novo acrescenta o que falta sem duplicar nem apagar contas de teste.
 */
import type {
  RmaItemStage,
  RmaPriority,
  Role,
  WarrantyStatus,
} from '@central/contracts';
import { eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from '../../common/crypto/passwords.js';
import { loadEnvFile, parseEnv } from '../../config/env.js';
import { createDatabase, createPool } from '../connection.js';
import type { Database } from '../database.types.js';
import {
  accounts,
  customerContacts,
  customers,
  rmaInvoices,
  rmaItems,
  rmas,
} from '../schema/index.js';

loadEnvFile();
const env = parseEnv();
if (env.NODE_ENV === 'production') {
  throw new Error('O seed de dados sintéticos não pode rodar em produção.');
}

/** Senha comum a todas as contas sintéticas. */
const PASSWORD = 'central-dev-2026';
const DAY_MS = 86_400_000;

const STAFF: { email: string; name: string; role: Role }[] = [
  {
    email: 'admin@central.local',
    name: 'Ana Administradora',
    role: 'administrador',
  },
  { email: 'agente@central.local', name: 'Bruno Agente', role: 'agente' },
  {
    email: 'consulta@central.local',
    name: 'Carla Consulta',
    role: 'agente_consulta',
  },
];

// Documentos fictícios com dígitos verificadores válidos.
const CUSTOMERS = [
  {
    kind: 'pessoa_juridica' as const,
    name: 'Segurança Exemplo Ltda.',
    tradeName: 'Exemplo Segurança',
    document: '11222333000181',
    contact: {
      name: 'Diego Cliente',
      email: 'cliente@exemplo.local',
      phone: '(11) 4000-0000',
    },
    portal: true,
  },
  {
    kind: 'pessoa_juridica' as const,
    name: 'Condomínio Fictício Alfa',
    tradeName: null,
    document: '12ABC34501DE35',
    contact: {
      name: 'Elisa Síndica',
      email: 'sindica@alfa.local',
      phone: null,
    },
    portal: false,
  },
  {
    kind: 'pessoa_fisica' as const,
    name: 'Fábio Pessoa Física',
    tradeName: null,
    document: '52998224725',
    contact: {
      name: 'Fábio Pessoa Física',
      email: 'fabio@pessoa.local',
      phone: null,
    },
    portal: true,
  },
];

interface SeedItem {
  model: string;
  serialNumber: string;
  reportedFailure: string;
  stage: RmaItemStage;
  warranty?: WarrantyStatus;
  /** Dias desde o recebimento físico (itens já recebidos). */
  receivedDaysAgo?: number;
  technicalReport?: string;
  internalNote?: string;
}

interface SeedRma {
  customerDocument: string;
  priority: RmaPriority;
  assignedToAgent: boolean;
  openedDaysAgo: number;
  updatedDaysAgo: number;
  invoice?: { number: string; issuerName: string; issuerDocument: string };
  items: SeedItem[];
}

// Modelos de equipamentos e números de série fictícios (prefixo SIM-).
const RMAS: SeedRma[] = [
  {
    customerDocument: '11222333000181',
    priority: 'normal',
    assignedToAgent: true,
    openedDaysAgo: 12,
    updatedDaysAgo: 0,
    invoice: {
      number: '13087',
      issuerName: 'Segurança Exemplo Ltda.',
      issuerDocument: '11222333000181',
    },
    items: [
      {
        model: 'SpeedFace V5L',
        serialNumber: 'SIM-SF-000101',
        reportedFailure: 'Não reconhece faces',
        stage: 'em_manutencao',
        warranty: 'em_analise',
        receivedDaysAgo: 9,
      },
      {
        model: 'SpeedFace V5L',
        serialNumber: 'SIM-SF-000102',
        reportedFailure: 'Tela sem imagem',
        stage: 'aguardando_peca',
        warranty: 'coberta',
        receivedDaysAgo: 9,
        internalNote: 'Display solicitado ao fornecedor.',
      },
      {
        model: 'Inbio 260',
        serialNumber: 'SIM-IB-000103',
        reportedFailure: 'Não comunica com o software',
        stage: 'recebido',
        receivedDaysAgo: 2,
      },
    ],
  },
  {
    customerDocument: '12ABC34501DE35',
    priority: 'alta',
    assignedToAgent: false,
    openedDaysAgo: 3,
    updatedDaysAgo: 1,
    items: [
      {
        model: 'ProFace X',
        serialNumber: 'SIM-PX-000201',
        reportedFailure: 'Não liga',
        stage: 'em_transporte',
        warranty: 'em_analise',
      },
    ],
  },
  {
    customerDocument: '52998224725',
    priority: 'normal',
    assignedToAgent: true,
    openedDaysAgo: 20,
    updatedDaysAgo: 1,
    invoice: {
      number: '5696',
      issuerName: 'Fábio Pessoa Física',
      issuerDocument: '52998224725',
    },
    items: [
      {
        model: 'VR10',
        serialNumber: 'SIM-VR-000301',
        reportedFailure: 'Reinicia sozinho',
        stage: 'pronto_para_devolucao',
        warranty: 'coberta',
        receivedDaysAgo: 16,
        technicalReport:
          'Fonte interna substituída. Equipamento testado por 24 h sem falhas.',
      },
    ],
  },
  {
    customerDocument: '11222333000181',
    priority: 'urgente',
    assignedToAgent: true,
    openedDaysAgo: 6,
    updatedDaysAgo: 0,
    invoice: {
      number: '19092',
      issuerName: 'Segurança Exemplo Ltda.',
      issuerDocument: '11222333000181',
    },
    items: [
      {
        model: 'MB460',
        serialNumber: 'SIM-MB-000401',
        reportedFailure: 'Leitor biométrico não responde',
        stage: 'em_diagnostico',
        receivedDaysAgo: 4,
        internalNote: 'Cliente pediu prioridade: equipamento da portaria.',
      },
      {
        model: 'MB460',
        serialNumber: 'SIM-MB-000402',
        reportedFailure: 'Teclado com teclas travadas',
        stage: 'em_testes',
        receivedDaysAgo: 4,
      },
    ],
  },
  {
    customerDocument: '12ABC34501DE35',
    priority: 'normal',
    assignedToAgent: false,
    openedDaysAgo: 35,
    updatedDaysAgo: 2,
    items: [
      {
        model: 'SC700',
        serialNumber: 'SIM-SC-000501',
        reportedFailure: 'Relé não aciona a fechadura',
        stage: 'entregue',
        warranty: 'nao_coberta',
        receivedDaysAgo: 30,
        technicalReport: 'Relé substituído.',
      },
      {
        model: 'SC700',
        serialNumber: 'SIM-SC-000502',
        reportedFailure: 'Relé não aciona a fechadura',
        stage: 'em_devolucao',
        warranty: 'nao_coberta',
        receivedDaysAgo: 30,
        technicalReport: 'Relé substituído.',
      },
    ],
  },
];

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function isEmpty(
  db: Database,
  table: typeof accounts | typeof rmas,
): Promise<boolean> {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(table);
  return total === 0;
}

async function seedIdentity(db: Database): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);
  await db.transaction(async (tx) => {
    await tx.insert(accounts).values(
      STAFF.map((staff) => ({
        ...staff,
        passwordHash,
        emailVerifiedAt: new Date(),
      })),
    );

    for (const { contact, portal, ...customer } of CUSTOMERS) {
      const [created] = await tx
        .insert(customers)
        .values(customer)
        .returning({ id: customers.id });
      let accountId: string | null = null;
      if (portal) {
        const [account] = await tx
          .insert(accounts)
          .values({
            email: contact.email,
            name: contact.name,
            passwordHash,
            role: 'cliente',
            emailVerifiedAt: new Date(),
          })
          .returning({ id: accounts.id });
        accountId = account.id;
      }
      await tx
        .insert(customerContacts)
        .values({ ...contact, customerId: created.id, accountId });
    }
  });

  console.log(`Contas sintéticas inseridas. Senha de todas: ${PASSWORD}`);
  console.table([
    ...STAFF.map(({ email, role }) => ({ email, papel: role })),
    ...CUSTOMERS.filter((c) => c.portal).map((c) => ({
      email: c.contact.email,
      papel: 'cliente',
    })),
  ]);
}

async function seedRmas(db: Database): Promise<void> {
  const documents = [...new Set(RMAS.map((rma) => rma.customerDocument))];
  const customerRows = await db
    .select({
      id: customers.id,
      document: customers.document,
      contactId: customerContacts.id,
      contactAccountId: customerContacts.accountId,
    })
    .from(customers)
    .leftJoin(customerContacts, eq(customerContacts.customerId, customers.id))
    .where(inArray(customers.document, documents));
  const customerByDocument = new Map(customerRows.map((c) => [c.document, c]));
  const [agent] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, 'agente@central.local'));

  await db.transaction(async (tx) => {
    for (const seed of RMAS) {
      const customer = customerByDocument.get(seed.customerDocument);
      if (!customer) continue;

      const [rma] = await tx
        .insert(rmas)
        .values({
          customerId: customer.id,
          requesterContactId: customer.contactId,
          // Cliente com acesso ao portal abre o próprio RMA; os demais, a equipe.
          openedByAccountId: customer.contactAccountId ?? agent?.id ?? null,
          assigneeAccountId: seed.assignedToAgent ? (agent?.id ?? null) : null,
          priority: seed.priority,
          createdAt: daysAgo(seed.openedDaysAgo),
          updatedAt: daysAgo(seed.updatedDaysAgo),
        })
        .returning({ id: rmas.id });

      await tx.insert(rmaItems).values(
        seed.items.map((item, index) => ({
          rmaId: rma.id,
          position: index + 1,
          model: item.model,
          serialNumber: item.serialNumber,
          reportedFailure: item.reportedFailure,
          warrantyRequested: item.warranty !== undefined,
          warranty: item.warranty ?? 'nao_solicitada',
          stage: item.stage,
          receivedAt:
            item.receivedDaysAgo === undefined
              ? null
              : daysAgo(item.receivedDaysAgo),
          slaHours:
            item.receivedDaysAgo === undefined ? null : env.RMA_SLA_HOURS,
          technicalReport: item.technicalReport ?? null,
          internalNote: item.internalNote ?? null,
        })),
      );
      if (seed.invoice) {
        await tx.insert(rmaInvoices).values({ rmaId: rma.id, ...seed.invoice });
      }
    }
  });
  console.log(`Chamados sintéticos inseridos: ${RMAS.length}.`);
}

const pool = createPool(env.DATABASE_URL);
const db = createDatabase(pool);

try {
  if (process.argv.includes('--reset')) {
    await db.execute(sql`truncate table
      rma_invoices, rma_items, rmas,
      audit_events, notifications, sessions, account_tokens, invitations,
      customer_contacts, customers, accounts restart identity cascade`);
    console.log('Dados apagados.');
  }

  if (await isEmpty(db, accounts)) await seedIdentity(db);
  else console.log('Contas já existem; mantidas.');

  if (await isEmpty(db, rmas)) await seedRmas(db);
  else console.log('Chamados já existem; mantidos.');
} finally {
  await pool.end();
}
