import { z } from 'zod';
import { hasPermission, ROLES, type Permission } from './authorization.js';
import { reasonSchema, uuidSchema } from './common.js';
import { itemSelectionSchema } from './rma-logistics.js';
import {
  NEXT_STAGES,
  RECEIVABLE_STAGES,
  RMA_ITEM_STAGES,
  SHIPPABLE_STAGES,
  SLA_END_STAGE,
  SLA_FINISHED_STAGES,
  type RmaItemStage,
} from './rma-stages.js';
import { RMA_PRIORITIES, type RmaPriority } from './rmas.js';

/**
 * Avanços com operação própria: o envio é declarado pelo cliente e o
 * recebimento é registrado pela equipe. A mudança de etapa não os faz.
 */
const OWN_OPERATION_STAGES: readonly RmaItemStage[] = ['enviado', 'recebido'];

/** Mudança de etapa pela equipe: só o próximo passo do processo. */
export function canChangeStage(from: RmaItemStage, to: RmaItemStage): boolean {
  return NEXT_STAGES[from].includes(to) && !OWN_OPERATION_STAGES.includes(to);
}

/**
 * Próximos passos que a equipe dá a partir de `from`: a mudança de etapa e o
 * recebimento na fábrica. O envio é sempre declarado pelo cliente.
 */
export function teamNextStages(from: RmaItemStage): RmaItemStage[] {
  return NEXT_STAGES[from].filter(
    (to) => to === 'recebido' || canChangeStage(from, to),
  );
}

/** Etapas de onde a equipe leva o item a `to`; é o filtro no banco. */
export function stagesChangeableTo(to: RmaItemStage): RmaItemStage[] {
  return RMA_ITEM_STAGES.filter((from) => canChangeStage(from, to));
}

/** Etapa em que a equipe anexa o vídeo do equipamento funcionando. */
export const VALIDATION_VIDEO_STAGES: readonly RmaItemStage[] = ['comprovacao'];

/**
 * A devolução exige o vídeo de comprovação de cada item: é a prova do
 * equipamento operando antes de voltar ao cliente (decisão de 30/09/2026).
 */
export function requiresValidationVideo(to: RmaItemStage): boolean {
  return to === SLA_END_STAGE;
}

/**
 * O chamado pode ser cancelado (ex.: o cliente desistiu da manutenção) até o
 * despacho do primeiro equipamento; depois disso, ele segue até o fim.
 */
export function isCancellable(items: { stage: RmaItemStage }[]): boolean {
  return !items.some((item) => SLA_FINISHED_STAGES.includes(item.stage));
}

/** Etapas em que o item ainda está com o cliente ou a caminho da fábrica. */
const BEFORE_RECEIPT_STAGES: readonly RmaItemStage[] = [
  ...SHIPPABLE_STAGES,
  ...RECEIVABLE_STAGES,
];

/**
 * Itens que já chegaram à fábrica: no cancelamento, entram em processo de
 * devolução ao cliente (decisão de 07/10/2026).
 */
export function itemsToReturn<Item extends { stage: RmaItemStage }>(
  items: Item[],
): Item[] {
  return items.filter((item) => !BEFORE_RECEIPT_STAGES.includes(item.stage));
}

/** Permissão para levar o item a `to`: despacho e recebimento têm a sua. */
export function stageChangePermission(to: RmaItemStage): Permission {
  // Despacho: as etapas que encerram o prazo (RN08).
  if (SLA_FINISHED_STAGES.includes(to)) return 'rma.dispatch';
  return to === 'recebido' ? 'rma.receive' : 'rma.write';
}

/** Papéis que podem ser responsáveis por um chamado. */
export const ASSIGNABLE_ROLES = ROLES.filter((role) =>
  hasPermission(role, 'rma.write'),
);

export const changeItemStageSchema = z.object({
  itemIds: itemSelectionSchema,
  stage: z.enum(RMA_ITEM_STAGES),
});
export type ChangeItemStageRequest = z.infer<typeof changeItemStageSchema>;

/**
 * `expectedAssigneeId` é o responsável que a pessoa via na tela: se mudou
 * nesse meio-tempo, nada é gravado e ela confere antes de tentar de novo.
 */
export const assignRmaSchema = z.object({
  assigneeId: uuidSchema.nullable(),
  expectedAssigneeId: uuidSchema.nullable(),
});
export type AssignRmaRequest = z.infer<typeof assignRmaSchema>;

export const attachValidationVideoSchema = z.object({ fileId: uuidSchema });
export type AttachValidationVideoRequest = z.infer<
  typeof attachValidationVideoSchema
>;

export const changePrioritySchema = z.object({
  priority: z.enum(RMA_PRIORITIES),
});
export type ChangePriorityRequest = z.infer<typeof changePrioritySchema>;

export const cancelRmaSchema = z.object({ reason: reasonSchema });
export type CancelRmaRequest = z.infer<typeof cancelRmaSchema>;

export interface AssigneeOption {
  id: string;
  name: string;
}

export interface RmaAssignmentView {
  assignee: AssigneeOption | null;
}

export interface RmaPriorityView {
  priority: RmaPriority;
}

export interface ItemStageChangeView {
  stage: RmaItemStage;
  itemIds: string[];
  changedAt: string;
}
