import { eq } from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
} from '../database/schema/index.js';
import type { AuthenticatedAccount } from './auth-context.js';

/** Conta com o cliente vinculado (quando houver), no formato da sessão. */
export async function loadAuthenticatedAccount(
  db: Executor,
  accountId: string,
): Promise<AuthenticatedAccount> {
  const [row] = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      role: accounts.role,
      emailVerifiedAt: accounts.emailVerifiedAt,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(accounts)
    .leftJoin(customerContacts, eq(customerContacts.accountId, accounts.id))
    .leftJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(eq(accounts.id, accountId));
  if (!row) throw new Error(`Conta ${accountId} não encontrada.`);

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: row.emailVerifiedAt !== null,
    customer:
      row.customerId && row.customerName
        ? { id: row.customerId, name: row.customerName }
        : null,
  };
}
