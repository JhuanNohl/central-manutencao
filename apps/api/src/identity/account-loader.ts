import { eq } from 'drizzle-orm';
import { reference } from '../common/mapping.js';
import type { Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
} from '../database/schema/index.js';
import type { AuthenticatedAccount } from './auth-context.js';

/**
 * Colunas que compõem a conta autenticada. A consulta precisa do LEFT JOIN
 * `accounts → customer_contacts → customers` (o cliente vinculado, se houver).
 */
export const authenticatedAccountColumns = {
  accountId: accounts.id,
  email: accounts.email,
  name: accounts.name,
  role: accounts.role,
  emailVerifiedAt: accounts.emailVerifiedAt,
  passwordChangeRequired: accounts.passwordChangeRequired,
  termsVersion: accounts.termsVersion,
  customerId: customers.id,
  customerName: customers.name,
};

type AuthenticatedAccountRow = {
  accountId: string;
  email: string;
  name: string;
  role: AuthenticatedAccount['role'];
  emailVerifiedAt: Date | null;
  passwordChangeRequired: boolean;
  termsVersion: string | null;
  customerId: string | null;
  customerName: string | null;
};

export function toAuthenticatedAccount(
  row: AuthenticatedAccountRow,
): AuthenticatedAccount {
  return {
    id: row.accountId,
    email: row.email,
    name: row.name,
    role: row.role,
    emailVerified: row.emailVerifiedAt !== null,
    passwordChangeRequired: row.passwordChangeRequired,
    acceptedTermsVersion: row.termsVersion,
    customer: reference(row.customerId, row.customerName),
  };
}

/** Conta com o cliente vinculado (quando houver), no formato da sessão. */
export async function loadAuthenticatedAccount(
  db: Executor,
  accountId: string,
): Promise<AuthenticatedAccount> {
  const [row] = await db
    .select(authenticatedAccountColumns)
    .from(accounts)
    .leftJoin(customerContacts, eq(customerContacts.accountId, accounts.id))
    .leftJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(eq(accounts.id, accountId));
  if (!row) throw new Error(`Conta ${accountId} não encontrada.`);
  return toAuthenticatedAccount(row);
}
