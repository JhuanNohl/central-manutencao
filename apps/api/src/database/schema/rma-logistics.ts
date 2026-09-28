import { SHIPMENT_METHODS } from '@central/contracts';
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, oneOf } from './columns.js';
import { accounts } from './identity.js';
import { rmaItems, rmas } from './rmas.js';

/** Envio à fábrica declarado pelo cliente para os itens selecionados (RF06). */
export const rmaShipments = pgTable(
  'rma_shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    method: text('method', { enum: SHIPMENT_METHODS }).notNull(),
    carrier: text('carrier'),
    trackingCode: text('tracking_code'),
    confirmedByAccountId: uuid('confirmed_by_account_id').references(
      () => accounts.id,
    ),
    confirmedAt: instant('confirmed_at').defaultNow().notNull(),
  },
  (t) => [
    index('rma_shipments_rma_idx').on(t.rmaId),
    check('rma_shipments_method_valid', oneOf(t.method, SHIPMENT_METHODS)),
  ],
);

/** Um item entra em um único envio à fábrica. */
export const rmaShipmentItems = pgTable(
  'rma_shipment_items',
  {
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => rmaShipments.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => rmaItems.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('rma_shipment_items_item_key').on(t.itemId)],
);

/** Recebimento físico registrado pelo agente (RF07, A5.2). */
export const rmaReceipts = pgTable(
  'rma_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    receivedByAccountId: uuid('received_by_account_id').references(
      () => accounts.id,
    ),
    receivedAt: instant('received_at').defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('rma_receipts_rma_idx').on(t.rmaId)],
);

/**
 * Um item é recebido uma única vez: o índice único impede que requisições
 * concorrentes gravem dois recebimentos e reiniciem o prazo (CA16).
 */
export const rmaReceiptItems = pgTable(
  'rma_receipt_items',
  {
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => rmaReceipts.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => rmaItems.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('rma_receipt_items_item_key').on(t.itemId)],
);
