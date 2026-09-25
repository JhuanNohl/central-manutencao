import { bigint, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './identity.js';
import { instant } from './columns.js';

/**
 * Histórico de ações relevantes (quem, quando, o quê, por quê).
 * Registros são apenas inseridos; não há atualização nem exclusão pela aplicação.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigint('id', { mode: 'number' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    occurredAt: instant('occurred_at').defaultNow().notNull(),
    /** Nulo quando a ação é do próprio sistema ou de visitante não autenticado. */
    actorAccountId: uuid('actor_account_id').references(() => accounts.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    reason: text('reason'),
    /** Valores relevantes (ex.: `{ before, after }`). Nunca guardar segredos. */
    data: jsonb('data').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
  },
  (t) => [
    index('audit_events_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
    index('audit_events_actor_idx').on(t.actorAccountId, t.occurredAt),
  ],
);
