import type {
  RmaDocumentView,
  RmaInvoiceView,
  RmaItemView,
  StaffReceiptView,
  StaffShipmentView,
  StoredFileView,
} from '@central/contracts';
import { and, asc, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { reference } from '../common/mapping.js';
import type { Executor } from '../database/database.types.js';
import {
  accounts,
  files,
  rmaDocuments,
  rmaInvoices,
  rmaItemPhotos,
  rmaItems,
  rmaReceiptItems,
  rmaReceipts,
  rmaShipmentItems,
  rmaShipments,
} from '../database/schema/index.js';
import { toFileView, type FileRow } from '../files/files.service.js';
import { itemSla } from './sla.js';

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

async function photosOf(
  db: Executor,
  itemIds: string[],
): Promise<Map<string, StoredFileView[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({ itemId: rmaItemPhotos.itemId, file: files })
    .from(rmaItemPhotos)
    .innerJoin(files, eq(files.id, rmaItemPhotos.fileId))
    .where(inArray(rmaItemPhotos.itemId, itemIds))
    .orderBy(asc(rmaItemPhotos.position));
  const photos = new Map<string, StoredFileView[]>();
  for (const [itemId, group] of groupBy(rows, (row) => row.itemId)) {
    photos.set(
      itemId,
      group.map((row) => toFileView(row.file)),
    );
  }
  return photos;
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

function toItemView(
  item: ItemRow,
  photos: StoredFileView[],
  now: Date,
): RmaItemView {
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
    sla: itemSla(item.receivedAt, item.slaHours, now),
    photos,
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
  const photos = await photosOf(
    db,
    items.map((item) => item.id),
  );
  return {
    items: items.map((item) =>
      toItemView(item, photos.get(item.id) ?? [], now),
    ),
    invoices: invoices.map(toInvoice),
    documents,
    shipments,
    receipts,
  };
}

/** Arquivo vinculado ao RMA, como foto de um item ou como documento. */
export async function findRmaFile(
  db: Executor,
  rmaId: string,
  fileId: string,
): Promise<FileRow | undefined> {
  const isItemPhoto = exists(
    db
      .select({ one: sql`1` })
      .from(rmaItemPhotos)
      .innerJoin(rmaItems, eq(rmaItems.id, rmaItemPhotos.itemId))
      .where(
        and(eq(rmaItemPhotos.fileId, files.id), eq(rmaItems.rmaId, rmaId)),
      ),
  );
  const isDocument = exists(
    db
      .select({ one: sql`1` })
      .from(rmaDocuments)
      .where(
        and(eq(rmaDocuments.fileId, files.id), eq(rmaDocuments.rmaId, rmaId)),
      ),
  );
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), or(isItemPhoto, isDocument)));
  return file;
}
