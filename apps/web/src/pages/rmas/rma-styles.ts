import {
  INVOICE_VALIDATION_STATUS_LABELS,
  RMA_ITEM_STAGE_LABELS,
  RMA_PRIORITY_LABELS,
  RMA_SLA_STATUS_LABELS,
  SLA_STATUS_LABELS,
  WARRANTY_STATUS_LABELS,
  type InvoiceValidationStatus,
  type RmaItemStage,
  type RmaPriority,
  type RmaSlaStatus,
  type SlaStatus,
  type WarrantyStatus,
  DOCUMENTATION_PENDING_LABELS,
  type DocumentationPendingReason,
} from '@central/contracts';
import {
  AlarmClock,
  ArrowUp,
  Ban,
  CircleCheck,
  ClipboardCheck,
  Clock,
  ClockAlert,
  FileCheck,
  FileWarning,
  FileX,
  Flame,
  Hourglass,
  Minus,
  Package,
  PackageOpen,
  ScanSearch,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Timer,
  Truck,
  UserRoundCheck,
  Video,
  Wrench,
  type LucideIcon,
  History,
} from 'lucide-react';
import type { BadgeTone, StatusStyle } from '../../components/Badge';

function style(label: string, tone: BadgeTone, icon: LucideIcon): StatusStyle {
  return { label, tone, icon };
}

/**
 * Logística em neutro, trabalho técnico e conclusão em verde, espera em
 * âmbar — a mesma leitura de cores do restante do painel.
 */
export const STAGE_STYLES: Record<RmaItemStage, StatusStyle> = {
  aguardando_envio: style(
    RMA_ITEM_STAGE_LABELS.aguardando_envio,
    'neutral',
    Clock,
  ),
  enviado: style(RMA_ITEM_STAGE_LABELS.enviado, 'neutral', Truck),
  recebido: style(RMA_ITEM_STAGE_LABELS.recebido, 'neutral', PackageOpen),
  em_diagnostico: style(
    RMA_ITEM_STAGE_LABELS.em_diagnostico,
    'success',
    ScanSearch,
  ),
  aguardando_aprovacao: style(
    RMA_ITEM_STAGE_LABELS.aguardando_aprovacao,
    'warning',
    UserRoundCheck,
  ),
  em_manutencao: style(RMA_ITEM_STAGE_LABELS.em_manutencao, 'success', Wrench),
  aguardando_peca: style(
    RMA_ITEM_STAGE_LABELS.aguardando_peca,
    'warning',
    Package,
  ),
  testes: style(RMA_ITEM_STAGE_LABELS.testes, 'success', ClipboardCheck),
  comprovacao: style(RMA_ITEM_STAGE_LABELS.comprovacao, 'success', Video),
  devolucao: style(RMA_ITEM_STAGE_LABELS.devolucao, 'neutral', Truck),
  finalizado: style(RMA_ITEM_STAGE_LABELS.finalizado, 'success', CircleCheck),
};

export const PRIORITY_STYLES: Record<RmaPriority, StatusStyle> = {
  normal: style(RMA_PRIORITY_LABELS.normal, 'neutral', Minus),
  alta: style(RMA_PRIORITY_LABELS.alta, 'warning', ArrowUp),
  urgente: style(RMA_PRIORITY_LABELS.urgente, 'danger', Flame),
};

export const WARRANTY_STYLES: Record<WarrantyStatus, StatusStyle> = {
  nao_solicitada: style(
    WARRANTY_STATUS_LABELS.nao_solicitada,
    'neutral',
    Minus,
  ),
  em_analise: style(
    WARRANTY_STATUS_LABELS.em_analise,
    'warning',
    ShieldQuestion,
  ),
  coberta: style(WARRANTY_STATUS_LABELS.coberta, 'success', ShieldCheck),
  nao_coberta: style(WARRANTY_STATUS_LABELS.nao_coberta, 'neutral', ShieldX),
};

/** Prazo do item: só começa no recebimento físico (RN04). */
export const SLA_STYLES: Record<SlaStatus, StatusStyle> = {
  nao_iniciado: style(SLA_STATUS_LABELS.nao_iniciado, 'neutral', Hourglass),
  no_prazo: style(SLA_STATUS_LABELS.no_prazo, 'success', Timer),
  atrasado: style(SLA_STATUS_LABELS.atrasado, 'danger', AlarmClock),
};

/** Prazo do chamado, pelo item que vence primeiro. */
export const RMA_SLA_STYLES: Record<RmaSlaStatus, StatusStyle> = {
  no_prazo: style(RMA_SLA_STATUS_LABELS.no_prazo, 'success', Timer),
  vence_em_breve: style(
    RMA_SLA_STATUS_LABELS.vence_em_breve,
    'warning',
    ClockAlert,
  ),
  atrasado: style(RMA_SLA_STATUS_LABELS.atrasado, 'danger', AlarmClock),
};

/** Resultado da validação do XML; falha técnica não é divergência (RN12). */
export const INVOICE_VALIDATION_STYLES: Record<
  InvoiceValidationStatus,
  StatusStyle
> = {
  valido: style(INVOICE_VALIDATION_STATUS_LABELS.valido, 'success', FileCheck),
  com_divergencias: style(
    INVOICE_VALIDATION_STATUS_LABELS.com_divergencias,
    'warning',
    FileWarning,
  ),
  nao_validado: style(
    INVOICE_VALIDATION_STATUS_LABELS.nao_validado,
    'danger',
    FileX,
  ),
};

/** Documentação que falta ou veio com erro (comum nos chamados importados). */
export const DOCUMENTATION_PENDING_STYLES: Record<
  DocumentationPendingReason,
  StatusStyle
> = {
  sem_documentacao: style(
    DOCUMENTATION_PENDING_LABELS.sem_documentacao,
    'warning',
    FileX,
  ),
  nf_com_divergencias: style(
    DOCUMENTATION_PENDING_LABELS.nf_com_divergencias,
    'warning',
    FileWarning,
  ),
};

/** Chamado vindo do sistema anterior, com o número que as pessoas conhecem. */
export function legacyStyle(legacyNumber: string): StatusStyle {
  return style(`Sistema anterior · nº ${legacyNumber}`, 'neutral', History);
}

/** Chamado encerrado sem reparo; as etapas dos itens ficam como estavam. */
export const CANCELLED_STYLE: StatusStyle = style('Cancelado', 'neutral', Ban);

/** Número público no formato exibido ao usuário. */
export function rmaLabel(number: number): string {
  return `#${number}`;
}
