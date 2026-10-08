import { and, eq } from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import {
  legacyRecords,
  type LegacyEntityType,
} from '../database/schema/index.js';
import { LEGACY_TICKET_SOURCE } from '../rmas/rma-legacy.js';

/**
 * Origem de cada registro no `legacy_records`. Um mesmo id do legado pode
 * gerar mais de uma entidade (o usuário vira contato e conta), por isso cada
 * entidade tem a sua origem.
 */
export const LEGACY_SOURCES = {
  staff: 'ost_staff',
  /** Cliente pelo documento: vários usuários com o mesmo CPF/CNPJ, um cliente. */
  customer: 'cpf_cnpj',
  contact: 'ost_user',
  account: 'ost_user_account',
  ticket: LEGACY_TICKET_SOURCE,
  equipment: 'ost_zk_equipment',
  photo: 'ost_zk_equipment_file',
  ticketFile: 'ost_zk_ticket_file',
  threadEntry: 'ost_thread_entry',
  shipment: 'ost_zk_ticket_envio',
} as const;
export type LegacySourceTable =
  (typeof LEGACY_SOURCES)[keyof typeof LEGACY_SOURCES];

export interface LegacyRecordInput {
  sourceTable: LegacySourceTable;
  sourceId: string | number;
  entityType: LegacyEntityType;
  entityId: string;
  reference?: string | null;
}

/** Entidade já criada a partir do registro do legado, se houver. */
export async function importedEntityOf(
  db: Executor,
  sourceTable: LegacySourceTable,
  sourceId: string | number,
): Promise<string | null> {
  const [row] = await db
    .select({ entityId: legacyRecords.entityId })
    .from(legacyRecords)
    .where(
      and(
        eq(legacyRecords.sourceTable, sourceTable),
        eq(legacyRecords.sourceId, String(sourceId)),
      ),
    );
  return row?.entityId ?? null;
}

export async function recordLegacy(
  db: Executor,
  records: LegacyRecordInput[],
): Promise<void> {
  if (records.length === 0) return;
  await db.insert(legacyRecords).values(
    records.map((record) => ({
      sourceTable: record.sourceTable,
      sourceId: String(record.sourceId),
      entityType: record.entityType,
      entityId: record.entityId,
      reference: record.reference ?? null,
    })),
  );
}
