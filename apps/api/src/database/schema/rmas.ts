import {
  RMA_ITEM_STAGES,
  RMA_PRIORITIES,
  WARRANTY_STATUSES,
} from '@central/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, oneOf, updatedAt } from './columns.js';
import { accounts, customerContacts, customers } from './identity.js';

/** Número público do RMA, exibido como "#100001". */
const FIRST_PUBLIC_NUMBER = 100_001;

/** Solicitação de manutenção: agrupa os equipamentos de um cliente. */
export const rmas = pgTable(
  'rmas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: integer('number')
      .notNull()
      .generatedAlwaysAsIdentity({ startWith: FIRST_PUBLIC_NUMBER }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    /** Contato do cliente que solicitou (o "solicitante"). */
    requesterContactId: uuid('requester_contact_id').references(
      () => customerContacts.id,
    ),
    /** Conta que registrou o RMA: o próprio cliente ou um agente em seu nome. */
    openedByAccountId: uuid('opened_by_account_id').references(
      () => accounts.id,
    ),
    assigneeAccountId: uuid('assignee_account_id').references(
      () => accounts.id,
    ),
    priority: text('priority', { enum: RMA_PRIORITIES })
      .notNull()
      .default('normal'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: instant('closed_at'),
  },
  (t) => [
    uniqueIndex('rmas_number_key').on(t.number),
    index('rmas_customer_idx').on(t.customerId),
    index('rmas_assignee_idx').on(t.assigneeAccountId),
    index('rmas_updated_idx').on(t.updatedAt),
    check('rmas_priority_valid', oneOf(t.priority, RMA_PRIORITIES)),
  ],
);

/** Equipamento de um RMA: cada item tem etapa, garantia e laudo próprios. */
export const rmaItems = pgTable(
  'rma_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    /** Ordem do item dentro do RMA (1, 2, 3…). */
    position: integer('position').notNull(),
    model: text('model').notNull(),
    serialNumber: text('serial_number').notNull(),
    reportedFailure: text('reported_failure').notNull(),
    notes: text('notes'),
    warrantyRequested: boolean('warranty_requested').notNull().default(false),
    warranty: text('warranty', { enum: WARRANTY_STATUSES })
      .notNull()
      .default('nao_solicitada'),
    stage: text('stage', { enum: RMA_ITEM_STAGES })
      .notNull()
      .default('aguardando_envio'),
    /** Recebimento físico registrado pelo agente; é o início do prazo do item. */
    receivedAt: instant('received_at'),
    technicalReport: text('technical_report'),
    internalNote: text('internal_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('rma_items_position_key').on(t.rmaId, t.position),
    index('rma_items_serial_idx').on(t.serialNumber),
    index('rma_items_stage_idx').on(t.stage),
    check('rma_items_stage_valid', oneOf(t.stage, RMA_ITEM_STAGES)),
    check('rma_items_warranty_valid', oneOf(t.warranty, WARRANTY_STATUSES)),
    check(
      'rma_items_received_before_stage',
      sql`${t.stage} in ('aguardando_envio', 'em_transporte') or ${t.receivedAt} is not null`,
    ),
  ],
);

/**
 * Nota fiscal de remessa vinculada ao RMA. Os dados virão da validação do
 * XML (P04); arquivo e resultado da validação entram com o upload na E1.
 */
export const rmaInvoices = pgTable(
  'rma_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    issuerName: text('issuer_name').notNull(),
    /** CNPJ/CPF do emitente, normalizado. */
    issuerDocument: text('issuer_document').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('rma_invoices_rma_idx').on(t.rmaId),
    index('rma_invoices_number_idx').on(t.number),
  ],
);
