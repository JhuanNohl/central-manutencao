import { and, eq, exists, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import { legacyRecords, rmas } from '../database/schema/index.js';

/** Tabela de tickets do sistema anterior (osTicket), origem dos RMAs importados. */
export const LEGACY_TICKET_SOURCE = 'ost_ticket';

const ticketRecord = and(
  eq(legacyRecords.sourceTable, LEGACY_TICKET_SOURCE),
  eq(legacyRecords.entityType, 'rma'),
);

/** Nº do ticket no sistema anterior de cada RMA importado. */
export async function legacyNumbersOf(
  db: Executor,
  rmaIds: string[],
): Promise<Map<string, string>> {
  if (rmaIds.length === 0) return new Map();
  const rows = await db
    .select({ rmaId: legacyRecords.entityId, number: legacyRecords.reference })
    .from(legacyRecords)
    .where(and(ticketRecord, inArray(legacyRecords.entityId, rmaIds)));
  return new Map(
    rows.flatMap((row) => (row.number ? [[row.rmaId, row.number]] : [])),
  );
}

/** Busca pelo número antigo, que o cliente e a equipe ainda usam. */
export function legacyNumberMatches(db: Executor, pattern: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(legacyRecords)
      .where(
        and(
          ticketRecord,
          eq(legacyRecords.entityId, rmas.id),
          ilike(legacyRecords.reference, pattern),
        ),
      ),
  );
}
