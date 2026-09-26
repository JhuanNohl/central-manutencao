import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

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
