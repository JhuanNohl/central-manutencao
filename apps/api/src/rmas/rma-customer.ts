import { isStaffRole } from '@central/contracts';
import { and, eq, type SQL } from 'drizzle-orm';
import { ApiException } from '../common/http/api-exception.js';
import type { Executor } from '../database/database.types.js';
import { customerContacts, customers } from '../database/schema/index.js';
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

export interface RmaRequester {
  id: string;
  name: string;
  email: string;
}

const missingContact = () =>
  ApiException.validation([
    { path: 'requesterContactId', message: 'Selecione um contato do cliente' },
  ]);

/** No portal, o contato ligado à própria conta; pela equipe, o escolhido. */
function requesterFilter(
  auth: AuthContext,
  contactId: string | undefined,
): SQL {
  if (!isStaffRole(auth.account.role)) {
    return eq(customerContacts.accountId, auth.account.id);
  }
  if (!contactId) throw missingContact();
  return eq(customerContacts.id, contactId);
}

/** Solicitante do RMA, contato do cliente que recebe os avisos do atendimento. */
export async function resolveRequester(
  db: Executor,
  auth: AuthContext,
  customerId: string,
  contactId: string | undefined,
): Promise<RmaRequester> {
  const [contact] = await db
    .select({
      id: customerContacts.id,
      name: customerContacts.name,
      email: customerContacts.email,
    })
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, customerId),
        requesterFilter(auth, contactId),
      ),
    );
  if (contact) return contact;
  throw isStaffRole(auth.account.role)
    ? missingContact()
    : ApiException.forbidden();
}
