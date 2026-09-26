import type { ContactInput, CustomerInput } from '@central/contracts';
import { eq } from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import { customerContacts, customers } from '../database/schema/index.js';

/**
 * Gravação de clientes e contatos, compartilhada entre o cadastro pela
 * equipe e o autocadastro. As regras de quem pode criar ficam nos serviços.
 */

export async function isDocumentRegistered(
  db: Executor,
  document: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.document, document));
  return row !== undefined;
}

export async function insertCustomer(
  db: Executor,
  input: CustomerInput,
  createdByAccountId: string,
): Promise<string> {
  const [row] = await db
    .insert(customers)
    .values({
      kind: input.kind,
      name: input.name,
      tradeName: input.tradeName || null,
      document: input.document,
      createdByAccountId,
    })
    .returning({ id: customers.id });
  return row.id;
}

export async function insertContact(
  db: Executor,
  customerId: string,
  input: ContactInput,
  accountId: string | null = null,
) {
  const [row] = await db
    .insert(customerContacts)
    .values({
      customerId,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      accountId,
    })
    .returning();
  return row;
}
