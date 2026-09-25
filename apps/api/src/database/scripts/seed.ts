/**
 * Dados sintéticos para desenvolvimento e homologação. Nunca roda em produção.
 * Uso: npm run db:seed  (para apagar antes: npm run db:seed -w @central/api -- --reset)
 */
import type { Role } from '@central/contracts';
import { sql } from 'drizzle-orm';
import { hashPassword } from '../../common/crypto/passwords.js';
import { loadEnvFile, parseEnv } from '../../config/env.js';
import { createDatabase, createPool } from '../connection.js';
import { accounts, customerContacts, customers } from '../schema/index.js';

loadEnvFile();
const env = parseEnv();
if (env.NODE_ENV === 'production') {
  throw new Error('O seed de dados sintéticos não pode rodar em produção.');
}

/** Senha comum a todas as contas sintéticas. */
const PASSWORD = 'central-dev-2026';

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

const pool = createPool(env.DATABASE_URL);
const db = createDatabase(pool);

try {
  if (process.argv.includes('--reset')) {
    await db.execute(sql`truncate table
      audit_events, notifications, sessions, account_tokens, invitations,
      customer_contacts, customers, accounts restart identity cascade`);
    console.log('Dados apagados.');
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(accounts);
  if (total > 0) {
    console.log(
      'O banco já possui contas; nada foi inserido (use npm run db:seed -w @central/api -- --reset).',
    );
  } else {
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

    console.log(
      `Dados sintéticos inseridos. Senha de todas as contas: ${PASSWORD}`,
    );
    console.table([
      ...STAFF.map(({ email, role }) => ({ email, papel: role })),
      ...CUSTOMERS.filter((c) => c.portal).map((c) => ({
        email: c.contact.email,
        papel: 'cliente',
      })),
    ]);
  }
} finally {
  await pool.end();
}
