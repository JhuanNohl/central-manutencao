import {
  SLA_DUE_SOON_HOURS,
  SLA_FINISHED_STAGES,
  type ListRmasQuery,
} from '@central/contracts';
import {
  and,
  eq,
  exists,
  ilike,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { containsPattern } from '../common/db/search.js';
import { HOUR_MS } from '../common/time/durations.js';
import type { Executor } from '../database/database.types.js';
import {
  customers,
  rmaInvoices,
  rmaItems,
  rmas,
} from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { documentationPendingCondition } from './rma-documentation-state.js';
import { legacyNumberMatches } from './rma-legacy.js';

/**
 * Vencimento mais próximo entre os itens com prazo em curso: a mesma conta de
 * `itemSla` e o mesmo recorte de `rmaSla`.
 */
export const nextDueAt = sql`(
  select min(${rmaItems.slaStartedAt} + ${rmaItems.slaHours} * interval '1 hour')
  from ${rmaItems}
  where ${rmaItems.rmaId} = ${rmas.id}
    and ${notInArray(rmaItems.stage, [...SLA_FINISHED_STAGES])}
)`;

function hasItemIn(db: Executor, condition: SQL | undefined): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(rmaItems)
      .where(and(eq(rmaItems.rmaId, rmas.id), condition)),
  );
}

/**
 * Nº do chamado (atual ou do sistema anterior), cliente, documento, modelo,
 * nº de série ou nº da NF.
 */
function searchFilter(db: Executor, search: string | undefined) {
  const term = containsPattern(search);
  if (!term) return undefined;
  return or(
    ilike(sql`${rmas.number}::text`, term),
    legacyNumberMatches(db, term),
    ilike(customers.name, term),
    ilike(customers.document, term),
    hasItemIn(
      db,
      or(ilike(rmaItems.model, term), ilike(rmaItems.serialNumber, term)),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(rmaInvoices)
        .where(
          and(
            eq(rmaInvoices.rmaId, rmas.id),
            or(
              ilike(rmaInvoices.number, term),
              ilike(rmaInvoices.issuerName, term),
            ),
          ),
        ),
    ),
  );
}

/** Aberto e com prazo vencido, perto do fim ou sem responsável. */
function attentionFilter(now: Date): SQL | undefined {
  const dueSoonLimit = new Date(now.getTime() + SLA_DUE_SOON_HOURS * HOUR_MS);
  return and(
    isNull(rmas.closedAt),
    or(
      isNull(rmas.assigneeAccountId),
      sql`${nextDueAt} <= ${dueSoonLimit.toISOString()}::timestamptz`,
    ),
  );
}

function assigneeFilter(
  auth: AuthContext,
  filter: ListRmasQuery['assignee'],
): SQL | undefined {
  if (filter === 'meus') return eq(rmas.assigneeAccountId, auth.account.id);
  if (filter === 'sem_responsavel') return isNull(rmas.assigneeAccountId);
  return undefined;
}

/** Filtros da fila de chamados da equipe; a consulta junta `customers`. */
export function rmaListFilter(
  db: Executor,
  auth: AuthContext,
  query: ListRmasQuery,
  now: Date,
): SQL | undefined {
  return and(
    searchFilter(db, query.search),
    query.stage ? hasItemIn(db, eq(rmaItems.stage, query.stage)) : undefined,
    query.priority ? eq(rmas.priority, query.priority) : undefined,
    assigneeFilter(auth, query.assignee),
    query.attention ? attentionFilter(now) : undefined,
    query.documentationPending ? documentationPendingCondition(db) : undefined,
  );
}
