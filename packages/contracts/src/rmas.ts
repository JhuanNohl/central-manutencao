import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import type { StoredFileView } from './files.js';
import type { InvoiceValidation } from './invoice-validation.js';
import type { ReceiptView, ShipmentView } from './rma-logistics.js';

/**
 * Etapas de um item do RMA (escopo A5.1). Cada equipamento tem a sua;
 * o RMA não tem status único, apenas agrega as etapas dos itens.
 */
export const RMA_ITEM_STAGES = [
  'aguardando_envio',
  'em_transporte',
  'recebido',
  'em_diagnostico',
  'aguardando_peca',
  'aguardando_cliente',
  'em_manutencao',
  'em_testes',
  'pronto_para_devolucao',
  'em_devolucao',
  'entregue',
] as const;
export type RmaItemStage = (typeof RMA_ITEM_STAGES)[number];

export const RMA_ITEM_STAGE_LABELS: Record<RmaItemStage, string> = {
  aguardando_envio: 'Aguardando envio',
  em_transporte: 'Em transporte à fábrica',
  recebido: 'Recebido na fábrica',
  em_diagnostico: 'Em diagnóstico',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  em_manutencao: 'Em manutenção',
  em_testes: 'Em testes',
  pronto_para_devolucao: 'Pronto para devolução',
  em_devolucao: 'Em devolução',
  entregue: 'Recebido pelo cliente',
};

/** Etapas em que o cliente ainda pode confirmar o envio do item. */
export const SHIPPABLE_STAGES: readonly RmaItemStage[] = ['aguardando_envio'];

/**
 * Etapas em que o item pode ser recebido. Inclui "aguardando envio" porque
 * o equipamento pode chegar sem envio declarado (ex.: aberto pela equipe).
 */
export const RECEIVABLE_STAGES: readonly RmaItemStage[] = [
  'aguardando_envio',
  'em_transporte',
];

export const RMA_PRIORITIES = ['normal', 'alta', 'urgente'] as const;
export type RmaPriority = (typeof RMA_PRIORITIES)[number];

export const RMA_PRIORITY_LABELS: Record<RmaPriority, string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

/** Situação da garantia do item (decisão final a detalhar na P09). */
export const WARRANTY_STATUSES = [
  'nao_solicitada',
  'em_analise',
  'coberta',
  'nao_coberta',
] as const;
export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  nao_solicitada: 'Não solicitada',
  em_analise: 'Garantia em análise',
  coberta: 'Coberto pela garantia',
  nao_coberta: 'Fora da garantia',
};

export const RMA_ASSIGNEE_FILTERS = ['meus', 'sem_responsavel'] as const;

export const listRmasQuerySchema = paginationQuerySchema.extend({
  /** Número do chamado, cliente, CNPJ/CPF, modelo, nº de série ou nº da NF. */
  search: z.string().trim().max(100).optional(),
  /** RMAs com pelo menos um item nesta etapa. */
  stage: z.enum(RMA_ITEM_STAGES).optional(),
  priority: z.enum(RMA_PRIORITIES).optional(),
  assignee: z.enum(RMA_ASSIGNEE_FILTERS).optional(),
});
export type ListRmasQuery = z.infer<typeof listRmasQuerySchema>;

export interface RmaStageCount {
  stage: RmaItemStage;
  count: number;
}

export interface RmaInvoiceView {
  number: string;
  issuerName: string;
  issuerDocument: string;
}

export interface RmaSummary {
  number: number;
  subject: string;
  priority: RmaPriority;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; document: string };
  requester: { name: string; email: string } | null;
  assignee: { id: string; name: string } | null;
  /** Primeira nota fiscal vinculada, quando houver. */
  invoice: RmaInvoiceView | null;
  itemCount: number;
  stages: RmaStageCount[];
}

/** Situação do prazo do item: começa só no recebimento físico (RN04). */
export const SLA_STATUSES = ['nao_iniciado', 'no_prazo', 'atrasado'] as const;
export type SlaStatus = (typeof SLA_STATUSES)[number];

export const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  nao_iniciado: 'Não iniciado',
  no_prazo: 'No prazo',
  atrasado: 'Atrasado',
};

export interface ItemSlaView {
  status: SlaStatus;
  startedAt: string | null;
  dueAt: string | null;
  /** Prazo aplicado no recebimento, em horas; não muda com a configuração. */
  hours: number | null;
}

export const RMA_DOCUMENT_KINDS = ['nota_xml', 'declaracao'] as const;
export type RmaDocumentKind = (typeof RMA_DOCUMENT_KINDS)[number];

export interface RmaDocumentView {
  id: string;
  kind: RmaDocumentKind;
  file: StoredFileView;
  /** Resultado registrado na abertura; só existe para o XML. */
  validation: Omit<InvoiceValidation, 'invoice'> | null;
}

export interface RmaItemView {
  id: string;
  position: number;
  model: string;
  serialNumber: string;
  reportedFailure: string;
  notes: string | null;
  stage: RmaItemStage;
  warranty: WarrantyStatus;
  receivedAt: string | null;
  /** Laudo técnico, visível ao cliente. */
  technicalReport: string | null;
  /** Somente equipe: nunca é enviado ao portal nem aos avisos do cliente. */
  internalNote: string | null;
}

export interface RmaDetail extends Omit<RmaSummary, 'invoice' | 'requester'> {
  requester: { name: string; email: string; phone: string | null } | null;
  openedBy: { id: string; name: string } | null;
  invoices: RmaInvoiceView[];
  items: RmaItemView[];
}

/* ---------- Portal do cliente: sem nota interna nem contas da equipe ---------- */

export const listOwnRmasQuerySchema = paginationQuerySchema;
export type ListOwnRmasQuery = z.infer<typeof listOwnRmasQuerySchema>;

export type PortalRmaItemView = Omit<RmaItemView, 'internalNote'>;

export interface PortalRmaSummary {
  number: number;
  subject: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  stages: RmaStageCount[];
}

export interface PortalRmaDetail extends PortalRmaSummary {
  requester: { name: string; email: string; phone: string | null } | null;
  invoices: RmaInvoiceView[];
  documents: RmaDocumentView[];
  items: PortalRmaItemView[];
  shipments: ShipmentView[];
  receipts: ReceiptView[];
}
