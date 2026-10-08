import {
  INVOICE_VALIDATION_STATUSES,
  RMA_DOCUMENT_KINDS,
  RMA_ITEM_STAGES,
  RMA_PRIORITIES,
  WARRANTY_STATUSES,
  type InvoiceIssue,
} from '@central/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, oneOf, updatedAt } from './columns.js';
import { files } from './files.js';
import { accounts, customerContacts, customers } from './identity.js';

/** Número público do RMA, exibido como "#100001". */
export const FIRST_PUBLIC_NUMBER = 100_001;

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
    /** Chave da tentativa de abertura, gerada pelo formulário (CA16). */
    openingKey: uuid('opening_key'),
    /**
     * Aceite eletrônico do termo de garantia na abertura pelo cliente: versão
     * aceita e momento. Quem aceitou é a conta que abriu (`openedByAccountId`).
     */
    termsVersion: text('terms_version'),
    termsAcceptedAt: instant('terms_accepted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    closedAt: instant('closed_at'),
    /** Cancelamento com motivo: encerra o chamado sem apagar nada. */
    cancelledAt: instant('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
    /** Quem cancelou, documentado para eventuais contestações. */
    cancelledByAccountId: uuid('cancelled_by_account_id').references(
      () => accounts.id,
    ),
  },
  (t) => [
    uniqueIndex('rmas_number_key').on(t.number),
    uniqueIndex('rmas_opening_key').on(t.openedByAccountId, t.openingKey),
    index('rmas_customer_idx').on(t.customerId),
    index('rmas_assignee_idx').on(t.assigneeAccountId),
    index('rmas_updated_idx').on(t.updatedAt),
    check('rmas_priority_valid', oneOf(t.priority, RMA_PRIORITIES)),
    check(
      'rmas_terms_acceptance_consistent',
      sql`(${t.termsVersion} is null) = (${t.termsAcceptedAt} is null)`,
    ),
    check(
      'rmas_cancellation_consistent',
      sql`(${t.cancelledAt} is null) = (${t.cancellationReason} is null) and (${t.cancelledAt} is null or ${t.closedAt} is not null)`,
    ),
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
    /** Recebimento físico registrado pelo agente. */
    receivedAt: instant('received_at'),
    /** Início do prazo, na entrada em diagnóstico (SLA_START_STAGE). */
    slaStartedAt: instant('sla_started_at'),
    /** Prazo aplicado no início, em horas; mudanças de configuração não o alteram. */
    slaHours: integer('sla_hours'),
    /** Fim do prazo, no envio de volta ao cliente (devolução). */
    slaFinishedAt: instant('sla_finished_at'),
    /** Vídeo da falha enviado na abertura, opcional. */
    videoFileId: uuid('video_file_id').references(() => files.id),
    technicalReport: text('technical_report'),
    internalNote: text('internal_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('rma_items_position_key').on(t.rmaId, t.position),
    uniqueIndex('rma_items_video_file_key').on(t.videoFileId),
    index('rma_items_serial_idx').on(t.serialNumber),
    index('rma_items_stage_idx').on(t.stage),
    check('rma_items_stage_valid', oneOf(t.stage, RMA_ITEM_STAGES)),
    check('rma_items_warranty_valid', oneOf(t.warranty, WARRANTY_STATUSES)),
    check(
      'rma_items_received_before_stage',
      sql`${t.stage} in ('aguardando_envio', 'enviado') or ${t.receivedAt} is not null`,
    ),
    check(
      'rma_items_sla_started_consistent',
      sql`(${t.slaStartedAt} is null) = (${t.slaHours} is null) and (${t.slaHours} is null or ${t.slaHours} > 0)`,
    ),
    check(
      'rma_items_sla_from_diagnosis',
      sql`${t.stage} in ('aguardando_envio', 'enviado', 'recebido') or ${t.slaStartedAt} is not null`,
    ),
    check(
      'rma_items_sla_finished_on_dispatch',
      sql`(${t.stage} in ('devolucao', 'finalizado')) = (${t.slaFinishedAt} is not null)`,
    ),
  ],
);

/** Fotos de cada equipamento, na ordem em que foram enviadas. */
export const rmaItemPhotos = pgTable(
  'rma_item_photos',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => rmaItems.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    position: integer('position').notNull(),
  },
  (t) => [
    uniqueIndex('rma_item_photos_file_key').on(t.fileId),
    uniqueIndex('rma_item_photos_position_key').on(t.itemId, t.position),
  ],
);

/**
 * Vídeo do equipamento funcionando, gravado pela equipe nas etapas finais e
 * exigido no despacho. Um por item: um novo substitui o anterior, que segue
 * guardado e citado no histórico.
 */
export const rmaValidationVideos = pgTable(
  'rma_validation_videos',
  {
    itemId: uuid('item_id')
      .primaryKey()
      .references(() => rmaItems.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    recordedByAccountId: uuid('recorded_by_account_id')
      .notNull()
      .references(() => accounts.id),
    recordedAt: instant('recorded_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('rma_validation_videos_file_key').on(t.fileId)],
);

/**
 * Documentação do RMA: XML da nota e/ou declaração de conteúdo, que podem
 * coexistir (RF05). O XML guarda o resultado da validação feita na abertura.
 */
export const rmaDocuments = pgTable(
  'rma_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: RMA_DOCUMENT_KINDS }).notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    validationStatus: text('validation_status', {
      enum: INVOICE_VALIDATION_STATUSES,
    }),
    rulesVersion: text('rules_version'),
    issues: jsonb('issues').$type<InvoiceIssue[]>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('rma_documents_file_key').on(t.fileId),
    uniqueIndex('rma_documents_kind_key').on(t.rmaId, t.kind),
    check('rma_documents_kind_valid', oneOf(t.kind, RMA_DOCUMENT_KINDS)),
    check(
      'rma_documents_xml_validated',
      sql`${t.kind} <> 'nota_xml' or (${t.validationStatus} is not null and ${t.rulesVersion} is not null)`,
    ),
  ],
);

/** Nota fiscal de remessa vinculada ao RMA, com os dados lidos do XML (P04). */
export const rmaInvoices = pgTable(
  'rma_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rmaId: uuid('rma_id')
      .notNull()
      .references(() => rmas.id, { onDelete: 'cascade' }),
    /** XML de origem; nulo nos registros anteriores ao upload. */
    documentId: uuid('document_id').references(() => rmaDocuments.id),
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
