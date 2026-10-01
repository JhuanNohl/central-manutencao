import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import type { StoredFileView } from './files.js';
import type { InvoiceValidation } from './invoice-validation.js';
import type {
  ReceiptView,
  ShipmentView,
  StaffReceiptView,
  StaffShipmentView,
} from './rma-logistics.js';

/**
 * Etapas de um item do RMA, na ordem do processo (fluxo de 01/10/2026). Cada
 * equipamento tem a sua; o RMA não tem status único, apenas agrega as etapas
 * dos itens (A5.1).
 */
export const RMA_ITEM_STAGES = [
  'aguardando_envio',
  'enviado',
  'recebido',
  'em_diagnostico',
  'aguardando_aprovacao',
  'em_manutencao',
  'aguardando_peca',
  'testes',
  'comprovacao',
  'devolucao',
  'finalizado',
] as const;
export type RmaItemStage = (typeof RMA_ITEM_STAGES)[number];

export const RMA_ITEM_STAGE_LABELS: Record<RmaItemStage, string> = {
  aguardando_envio: 'Aguardando envio',
  enviado: 'Enviado',
  recebido: 'Recebido',
  em_diagnostico: 'Em diagnóstico',
  aguardando_aprovacao: 'Aguardando aprovação',
  em_manutencao: 'Em manutenção',
  aguardando_peca: 'Aguardando peça',
  testes: 'Testes',
  comprovacao: 'Comprovação',
  devolucao: 'Devolução',
  finalizado: 'Finalizado',
};

/**
 * Próxima etapa de cada uma: o processo só avança, um passo por vez, sem
 * voltar nem pular. A única exceção é a manutenção, que pode parar em
 * "aguardando peça" e retomar dali.
 */
export const NEXT_STAGES: Record<RmaItemStage, readonly RmaItemStage[]> = {
  aguardando_envio: ['enviado'],
  enviado: ['recebido'],
  recebido: ['em_diagnostico'],
  em_diagnostico: ['aguardando_aprovacao'],
  aguardando_aprovacao: ['em_manutencao'],
  em_manutencao: ['aguardando_peca', 'testes'],
  aguardando_peca: ['em_manutencao'],
  testes: ['comprovacao'],
  comprovacao: ['devolucao'],
  devolucao: ['finalizado'],
  finalizado: [],
};

/** Etapas de onde o processo chega a `to`. */
export function previousStages(to: RmaItemStage): RmaItemStage[] {
  return RMA_ITEM_STAGES.filter((from) => NEXT_STAGES[from].includes(to));
}

/** Etapas em que o cliente ainda pode confirmar o envio do item. */
export const SHIPPABLE_STAGES: readonly RmaItemStage[] =
  previousStages('enviado');

/** Só o item enviado pode ser recebido: o envio não é pulado. */
export const RECEIVABLE_STAGES: readonly RmaItemStage[] =
  previousStages('recebido');

/**
 * Abertura pela equipe: o equipamento já está na fábrica e começa no
 * diagnóstico, com o recebimento registrado na própria abertura.
 */
export const STAFF_OPENING_STAGE: RmaItemStage = 'em_diagnostico';

/** O prazo do item começa no diagnóstico (decisão de 01/10/2026). */
export const SLA_START_STAGE: RmaItemStage = 'em_diagnostico';

/** O prazo termina com o envio de volta ao cliente, na devolução (RN08). */
export const SLA_END_STAGE: RmaItemStage = 'devolucao';

/** Etapas em que o prazo do item já terminou. */
export const SLA_FINISHED_STAGES: readonly RmaItemStage[] = [
  SLA_END_STAGE,
  'finalizado',
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
  /**
   * Só chamados abertos que pedem ação: prazo vencido, prazo perto do fim
   * ou sem responsável. Ordena pelo vencimento mais próximo.
   */
  attention: z.stringbool().optional(),
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

/**
 * Cancelamento do chamado: encerra sem apagar nada e documenta quem, quando
 * e por quê (decisões de 30/09 e 01/10/2026).
 */
export interface RmaCancellationView {
  cancelledAt: string;
  reason: string;
  /** Só na visão da equipe: o portal não mostra contas internas (RN11). */
  cancelledBy: { id: string; name: string } | null;
}

export type PortalRmaCancellationView = Omit<
  RmaCancellationView,
  'cancelledBy'
>;

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
  /** Modelos distintos, na ordem dos itens. */
  models: string[];
  stages: RmaStageCount[];
  /** Prazo do item que vence primeiro; nulo antes do primeiro recebimento. */
  sla: RmaSlaView | null;
  cancellation: RmaCancellationView | null;
}

/**
 * Situação do prazo do chamado, pela do item que vence primeiro. O chamado
 * não tem prazo próprio: cada item mantém o seu (D10).
 */
export const RMA_SLA_STATUSES = [
  'no_prazo',
  'vence_em_breve',
  'atrasado',
] as const;
export type RmaSlaStatus = (typeof RMA_SLA_STATUSES)[number];

export const RMA_SLA_STATUS_LABELS: Record<RmaSlaStatus, string> = {
  no_prazo: 'No prazo',
  vence_em_breve: 'Vence em breve',
  atrasado: 'Atrasado',
};

/** Antecedência com que o chamado passa a "vence em breve" e pede atenção. */
export const SLA_DUE_SOON_HOURS = 72;

export interface RmaSlaView {
  status: RmaSlaStatus;
  dueAt: string;
}

/** Situação do prazo do item: começa no diagnóstico (SLA_START_STAGE). */
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
  /** Prazo aplicado no início, em horas; não muda com a configuração. */
  hours: number | null;
  /** Fim do prazo, no envio de volta ao cliente; a situação fica a daquele dia. */
  finishedAt: string | null;
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

/** Vídeo do equipamento funcionando, gravado pela equipe antes do despacho. */
export interface ValidationVideoView {
  file: StoredFileView;
  recordedAt: string;
  recordedBy: { id: string; name: string } | null;
}

export interface RmaItemView {
  id: string;
  position: number;
  model: string;
  serialNumber: string;
  reportedFailure: string;
  notes: string | null;
  warrantyRequested: boolean;
  stage: RmaItemStage;
  warranty: WarrantyStatus;
  receivedAt: string | null;
  sla: ItemSlaView;
  photos: StoredFileView[];
  /** Vídeo da falha enviado na abertura, junto das fotos. */
  video: StoredFileView | null;
  validationVideo: ValidationVideoView | null;
  /** Laudo técnico, visível ao cliente. */
  technicalReport: string | null;
  /** Somente equipe: nunca é enviado ao portal nem aos avisos do cliente. */
  internalNote: string | null;
}

export interface RmaDetail extends Omit<RmaSummary, 'invoice' | 'requester'> {
  requester: { name: string; email: string; phone: string | null } | null;
  /** Cancelado ou com todos os equipamentos de volta ao cliente; não muda mais. */
  closedAt: string | null;
  openedBy: { id: string; name: string } | null;
  invoices: RmaInvoiceView[];
  documents: RmaDocumentView[];
  items: RmaItemView[];
  shipments: StaffShipmentView[];
  receipts: StaffReceiptView[];
}

/* ---------- Portal do cliente: sem nota interna nem contas da equipe ---------- */

export const listOwnRmasQuerySchema = paginationQuerySchema;
export type ListOwnRmasQuery = z.infer<typeof listOwnRmasQuerySchema>;

/** O cliente vê o vídeo de validação, mas não quem o gravou (RN11). */
export type PortalRmaItemView = Omit<
  RmaItemView,
  'internalNote' | 'validationVideo'
> & {
  validationVideo: Omit<ValidationVideoView, 'recordedBy'> | null;
};

export interface PortalRmaSummary {
  number: number;
  subject: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  stages: RmaStageCount[];
  cancellation: PortalRmaCancellationView | null;
}

export interface PortalRmaDetail extends PortalRmaSummary {
  requester: { name: string; email: string; phone: string | null } | null;
  invoices: RmaInvoiceView[];
  documents: RmaDocumentView[];
  items: PortalRmaItemView[];
  shipments: ShipmentView[];
  receipts: ReceiptView[];
}
