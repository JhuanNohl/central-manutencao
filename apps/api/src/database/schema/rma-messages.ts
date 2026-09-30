import { RMA_MESSAGE_MAX_LENGTH, RMA_MESSAGE_SIDES } from '@central/contracts';
import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, oneOf } from './columns.js';
import { accounts } from './identity.js';
import { rmas } from './rmas.js';

/**
 * Conversa do chamado entre o cliente e a equipe. Mensagens são apenas
 * inseridas: o histórico da conversa não é editado nem apagado.
 */
export const rmaMessages = pgTable(
  'rma_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    authorAccountId: uuid('author_account_id')
      .notNull()
      .references(() => accounts.id),
    authorSide: text('author_side', { enum: RMA_MESSAGE_SIDES }).notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('rma_messages_rma_idx').on(t.rmaId, t.createdAt),
    check('rma_messages_side_valid', oneOf(t.authorSide, RMA_MESSAGE_SIDES)),
    check(
      'rma_messages_body_length',
      sql`char_length(${t.body}) between 1 and ${sql.raw(String(RMA_MESSAGE_MAX_LENGTH))}`,
    ),
  ],
);
