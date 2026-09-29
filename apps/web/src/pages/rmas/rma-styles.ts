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
} from '@central/contracts';
import {
  AlarmClock,
  ArrowUp,
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
  PackageCheck,
  PackageOpen,
  ScanSearch,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Timer,
  Truck,
  UserRoundSearch,
  Wrench,
  type LucideIcon,
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
  em_transporte: style(RMA_ITEM_STAGE_LABELS.em_transporte, 'neutral', Truck),
  recebido: style(RMA_ITEM_STAGE_LABELS.recebido, 'neutral', PackageOpen),
  em_diagnostico: style(
    RMA_ITEM_STAGE_LABELS.em_diagnostico,
    'success',
    ScanSearch,
  ),
  aguardando_peca: style(
    RMA_ITEM_STAGE_LABELS.aguardando_peca,
    'warning',
    Package,
  ),
  aguardando_cliente: style(
    RMA_ITEM_STAGE_LABELS.aguardando_cliente,
    'warning',
    UserRoundSearch,
  ),
  em_manutencao: style(RMA_ITEM_STAGE_LABELS.em_manutencao, 'success', Wrench),
  em_testes: style(RMA_ITEM_STAGE_LABELS.em_testes, 'success', ClipboardCheck),
  pronto_para_devolucao: style(
    RMA_ITEM_STAGE_LABELS.pronto_para_devolucao,
    'success',
    PackageCheck,
  ),
  em_devolucao: style(RMA_ITEM_STAGE_LABELS.em_devolucao, 'neutral', Truck),
  entregue: style(RMA_ITEM_STAGE_LABELS.entregue, 'success', CircleCheck),
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

/** Número público no formato exibido ao usuário. */
export function rmaLabel(number: number): string {
  return `#${number}`;
}
