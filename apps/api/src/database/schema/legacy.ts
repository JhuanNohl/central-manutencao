import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { instant, oneOf } from './columns.js';

/** Entidades deste sistema que podem nascer de um registro do sistema anterior. */
export const LEGACY_ENTITY_TYPES = [
  'account',
  'customer',
  'customer_contact',
  'rma',
  'rma_item',
  'rma_message',
  'rma_internal_note',
  'rma_shipment',
  'file',
] as const;
export type LegacyEntityType = (typeof LEGACY_ENTITY_TYPES)[number];

/**
 * De-para da migração do sistema anterior (osTicket): cada registro importado
 * guarda a origem (tabela e id no legado) e a entidade criada aqui. Com ele a
 * importação roda de novo sem duplicar, e o atendimento continua achável pelo
 * número antigo (`reference`). As tabelas do sistema não mudam.
 */
export const legacyRecords = pgTable(
  'legacy_records',
  {
    /** Tabela de origem no legado, ex.: `ost_ticket`, `ost_zk_equipment`. */
    sourceTable: text('source_table').notNull(),
    /** Chave do registro na origem, como texto (ids numéricos ou compostos). */
    sourceId: text('source_id').notNull(),
    entityType: text('entity_type', { enum: LEGACY_ENTITY_TYPES }).notNull(),
    entityId: uuid('entity_id').notNull(),
    /** Identificação que as pessoas conhecem no legado, ex.: nº do ticket. */
    reference: text('reference'),
    importedAt: instant('imported_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceTable, t.sourceId] }),
    uniqueIndex('legacy_records_entity_key').on(
      t.sourceTable,
      t.entityType,
      t.entityId,
    ),
    index('legacy_records_entity_idx').on(t.entityType, t.entityId),
    index('legacy_records_reference_idx').on(t.reference),
    check(
      'legacy_records_entity_type_valid',
      oneOf(t.entityType, LEGACY_ENTITY_TYPES),
    ),
  ],
);
