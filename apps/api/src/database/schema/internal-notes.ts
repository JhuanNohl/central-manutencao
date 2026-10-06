import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, instant } from './columns.js';
import { accounts, customers } from './identity.js';
import { rmas } from './rmas.js';

/**
 * Anotações internas do chamado, só da equipe (RN11): nunca chegam ao
 * portal. Também recebem as notas internas importadas do sistema anterior.
 */
export const rmaInternalNotes = pgTable(
  'rma_internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    /** Nula na nota importada de um agente sem conta neste sistema. */
    authorAccountId: uuid('author_account_id').references(() => accounts.id),
    /** Nome de quem escreveu, guardado com a nota (vale para as importadas). */
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('rma_internal_notes_rma_idx').on(t.rmaId, t.createdAt)],
);

/**
 * Observações internas sobre o cliente, só da equipe: histórico, acordos e
 * particularidades. Um texto por cliente, editável.
 */
export const customerNotes = pgTable('customer_notes', {
  customerId: uuid('customer_id')
    .primaryKey()
    .references(() => customers.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  updatedByAccountId: uuid('updated_by_account_id').references(
    () => accounts.id,
  ),
  updatedAt: instant('updated_at').defaultNow().notNull(),
});
