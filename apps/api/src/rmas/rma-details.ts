import type {
  RmaDocumentView,
  RmaInvoiceView,
  RmaItemView,
  StaffReceiptView,
  StaffShipmentView,
} from '@central/contracts';
import { asc, eq, inArray } from 'drizzle-orm';
import { reference } from '../common/mapping.js';
import type { Executor } from '../database/database.types.js';
import {
  accounts,
  files,
  rmaDocuments,
  rmaInvoices,
  rmaItems,
  rmaReceiptItems,
  rmaReceipts,
  rmaShipmentItems,
  rmaShipments,
} from '../database/schema/index.js';
import { toFileView } from '../files/files.service.js';
import { mediaOf, type ItemMedia } from './rma-media.js';
import { itemSla } from './sla.js';

const NO_MEDIA: ItemMedia = { photos: [], video: null, validationVideo: null };

/**
 * Leitura das partes de um RMA comuns à visão da equipe e à do portal.
 * Cada visão decide o que omite (nota interna, contas da equipe).
 */

export type ItemRow = typeof rmaItems.$inferSelect;
type InvoiceRow = typeof rmaInvoices.$inferSelect;

export function groupBy<Row, Key>(rows: Row[], keyOf: (row: Row) => Key) {
  const groups = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

export function toInvoice(row: InvoiceRow): RmaInvoiceView {
  return {
    number: row.number,
    issuerName: row.issuerName,
    issuerDocument: row.issuerDocument,
  };
}

export function itemsOf(db: Executor, rmaIds: string[]): Promise<ItemRow[]> {
  return db
    .select()
    .from(rmaItems)
    .where(inArray(rmaItems.rmaId, rmaIds))
    .orderBy(asc(rmaItems.position));
}

export function invoicesOf(
  db: Executor,
  rmaIds: string[],
): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(rmaInvoices)
    .where(inArray(rmaInvoices.rmaId, rmaIds))
    .orderBy(asc(rmaInvoices.createdAt));
}

async function documentsOf(
  db: Executor,
  rmaId: string,
): Promise<RmaDocumentView[]> {
  const rows = await db
    .select({ document: rmaDocuments, file: files })
    .from(rmaDocuments)
    .innerJoin(files, eq(files.id, rmaDocuments.fileId))
    .where(eq(rmaDocuments.rmaId, rmaId))
    .orderBy(asc(rmaDocuments.kind));
  return rows.map(({ document, file }) => ({
    id: document.id,
    kind: document.kind,
    file: toFileView(file),
    validation:
      document.validationStatus && document.rulesVersion
        ? {
            status: document.validationStatus,
            rulesVersion: document.rulesVersion,
            issues: document.issues ?? [],
          }
        : null,
  }));
}

async function shipmentsOf(
  db: Executor,
  rmaId: string,
): Promise<StaffShipmentView[]> {
  const rows = await db
    .select({
      shipment: rmaShipments,
      itemId: rmaShipmentItems.itemId,
      byName: accounts.name,
    })
    .from(rmaShipments)
    .innerJoin(
      rmaShipmentItems,
      eq(rmaShipmentItems.shipmentId, rmaShipments.id),
    )
    .innerJoin(rmaItems, eq(rmaItems.id, rmaShipmentItems.itemId))
    .leftJoin(accounts, eq(accounts.id, rmaShipments.confirmedByAccountId))
    .where(eq(rmaShipments.rmaId, rmaId))
    .orderBy(asc(rmaShipments.confirmedAt), asc(rmaItems.position));
  return [...groupBy(rows, (row) => row.shipment.id).values()].map((group) => {
    const [{ shipment, byName }] = group;
    return {
      id: shipment.id,
      method: shipment.method,
      carrier: shipment.carrier,
      trackingCode: shipment.trackingCode,
      confirmedAt: shipment.confirmedAt.toISOString(),
      confirmedBy: reference(shipment.confirmedByAccountId, byName),
      itemIds: group.map((row) => row.itemId),
    };
  });
}

async function receiptsOf(
  db: Executor,
  rmaId: string,
): Promise<StaffReceiptView[]> {
  const rows = await db
    .select({
      receipt: rmaReceipts,
      itemId: rmaReceiptItems.itemId,
      byName: accounts.name,
    })
    .from(rmaReceipts)
    .innerJoin(rmaReceiptItems, eq(rmaReceiptItems.receiptId, rmaReceipts.id))
    .innerJoin(rmaItems, eq(rmaItems.id, rmaReceiptItems.itemId))
    .leftJoin(accounts, eq(accounts.id, rmaReceipts.receivedByAccountId))
    .where(eq(rmaReceipts.rmaId, rmaId))
    .orderBy(asc(rmaReceipts.receivedAt), asc(rmaItems.position));
  return [...groupBy(rows, (row) => row.receipt.id).values()].map((group) => {
    const [{ receipt, byName }] = group;
    return {
      id: receipt.id,
      receivedAt: receipt.receivedAt.toISOString(),
      receivedBy: reference(receipt.receivedByAccountId, byName),
      itemIds: group.map((row) => row.itemId),
    };
  });
}

function toItemView(item: ItemRow, media: ItemMedia, now: Date): RmaItemView {
  return {
    id: item.id,
    position: item.position,
    model: item.model,
    serialNumber: item.serialNumber,
    reportedFailure: item.reportedFailure,
    notes: item.notes,
    warrantyRequested: item.warrantyRequested,
    stage: item.stage,
    warranty: item.warranty,
    receivedAt: item.receivedAt?.toISOString() ?? null,
    sla: itemSla(item, now),
    ...media,
    technicalReport: item.technicalReport,
    internalNote: item.internalNote,
  };
}

export interface RmaDetailParts {
  items: RmaItemView[];
  invoices: RmaInvoiceView[];
  documents: RmaDocumentView[];
  shipments: StaffShipmentView[];
  receipts: StaffReceiptView[];
}

export async function loadDetailParts(
  db: Executor,
  rmaId: string,
  now = new Date(),
): Promise<RmaDetailParts> {
  const [items, invoices, documents, shipments, receipts] = await Promise.all([
    itemsOf(db, [rmaId]),
    invoicesOf(db, [rmaId]),
    documentsOf(db, rmaId),
    shipmentsOf(db, rmaId),
    receiptsOf(db, rmaId),
  ]);
  const media = await mediaOf(db, items);
  return {
    items: items.map((item) =>
      toItemView(item, media.get(item.id) ?? NO_MEDIA, now),
    ),
    invoices: invoices.map(toInvoice),
    documents,
    shipments,
    receipts,
  };
}
