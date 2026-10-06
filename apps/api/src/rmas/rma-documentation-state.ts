import {
  documentationPending,
  type DocumentationPendingReason,
} from '@central/contracts';
import {
  and,
  count,
  eq,
  exists,
  inArray,
  isNull,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import { rmaDocuments, rmaInvoices, rmas } from '../database/schema/index.js';

const divergentInvoice = and(
  eq(rmaDocuments.kind, 'nota_xml'),
  eq(rmaDocuments.validationStatus, 'com_divergencias'),
);

/**
 * Pendência de documentação de cada RMA. Conta como documentação o arquivo
 * anexado e também a nota registrada sem arquivo (dados anteriores ao envio
 * do XML).
 */
export async function documentationPendingOf(
  db: Executor,
  rmasToCheck: { id: string; closedAt: Date | null }[],
): Promise<Map<string, DocumentationPendingReason | null>> {
  const ids = rmasToCheck.map((rma) => rma.id);
  const [documents, invoices] = ids.length
    ? await Promise.all([
        db
          .select({
            rmaId: rmaDocuments.rmaId,
            total: count(),
            divergent: sql<boolean>`bool_or(${divergentInvoice})`,
          })
          .from(rmaDocuments)
          .where(inArray(rmaDocuments.rmaId, ids))
          .groupBy(rmaDocuments.rmaId),
        db
          .select({ rmaId: rmaInvoices.rmaId, total: count() })
          .from(rmaInvoices)
          .where(inArray(rmaInvoices.rmaId, ids))
          .groupBy(rmaInvoices.rmaId),
      ])
    : [[], []];
  const documentsByRma = new Map(documents.map((row) => [row.rmaId, row]));
  const invoicesByRma = new Map(invoices.map((row) => [row.rmaId, row.total]));
  return new Map(
    rmasToCheck.map((rma) => {
      const state = documentsByRma.get(rma.id);
      return [
        rma.id,
        documentationPending({
          closed: rma.closedAt !== null,
          documentCount: (state?.total ?? 0) + (invoicesByRma.get(rma.id) ?? 0),
          divergentInvoice: state?.divergent ?? false,
        }),
      ];
    }),
  );
}

/** Filtro da lista: chamado aberto sem documentação ou com nota divergente. */
export function documentationPendingCondition(db: Executor): SQL | undefined {
  const documentsOf = (condition?: SQL) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(rmaDocuments)
        .where(and(eq(rmaDocuments.rmaId, rmas.id), condition)),
    );
  const invoices = exists(
    db
      .select({ one: sql`1` })
      .from(rmaInvoices)
      .where(eq(rmaInvoices.rmaId, rmas.id)),
  );
  return and(
    isNull(rmas.closedAt),
    or(and(not(documentsOf()), not(invoices)), documentsOf(divergentInvoice)),
  );
}
