import { isStaffRole } from '@central/contracts';
import { eq } from 'drizzle-orm';
import { ApiException } from '../common/http/api-exception.js';
import type { Executor } from '../database/database.types.js';
import { customers } from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';

export interface RmaCustomer {
  id: string;
  document: string;
}

/**
 * Cliente de uma operação de abertura. A conta do portal age sempre sobre o
 * próprio cadastro (um `customerId` enviado por ela é ignorado); a equipe
 * informa o cliente (RN01).
 */
export async function resolveRmaCustomer(
  db: Executor,
  auth: AuthContext,
  customerId: string | undefined,
): Promise<RmaCustomer> {
  const { role, customer: own } = auth.account;
  if (!isStaffRole(role) && !own) throw ApiException.forbidden();
  const id = isStaffRole(role) ? customerId : own?.id;
  if (!id) {
    throw ApiException.validation([
      { path: 'customerId', message: 'Selecione o cliente' },
    ]);
  }
  const [customer] = await db
    .select({ id: customers.id, document: customers.document })
    .from(customers)
    .where(eq(customers.id, id));
  if (!customer) throw ApiException.notFound('Cliente não encontrado.');
  return customer;
}
