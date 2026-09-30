import { z } from 'zod';
import { hasPermission, ROLES, type Permission } from './authorization.js';
import { reasonSchema, uuidSchema } from './common.js';
import { itemSelectionSchema } from './rma-logistics.js';
import {
  RMA_ITEM_STAGES,
  RMA_PRIORITIES,
  type RmaItemStage,
  type RmaPriority,
} from './rmas.js';

/** Condução técnica: do diagnóstico até a liberação para devolução. */
const TECHNICAL_STAGES = [
  'em_diagnostico',
  'aguardando_peca',
  'aguardando_cliente',
  'em_manutencao',
  'em_testes',
  'pronto_para_devolucao',
] as const satisfies readonly RmaItemStage[];

/** Etapas do despacho: exigem `rma.dispatch` e encerram o prazo (RN08). */
const DISPATCH_STAGES: readonly RmaItemStage[] = ['em_devolucao', 'entregue'];

const otherTechnicalStages = (stage: RmaItemStage) =>
  TECHNICAL_STAGES.filter((target) => target !== stage);

/**
 * Mudanças de etapa feitas pela equipe (proposta de 30/09/2026, até a tabela
 * A5.1). Na condução técnica a ordem é livre; a devolução só parte de "pronto
 * para devolução" e "recebido pelo cliente" é final. Envio e recebimento na
 * fábrica têm operações próprias e não aparecem aqui.
 */
export const STAGE_TRANSITIONS: Record<RmaItemStage, readonly RmaItemStage[]> =
  {
    aguardando_envio: [],
    em_transporte: [],
    recebido: TECHNICAL_STAGES,
    em_diagnostico: otherTechnicalStages('em_diagnostico'),
    aguardando_peca: otherTechnicalStages('aguardando_peca'),
    aguardando_cliente: otherTechnicalStages('aguardando_cliente'),
    em_manutencao: otherTechnicalStages('em_manutencao'),
    em_testes: otherTechnicalStages('em_testes'),
    pronto_para_devolucao: [
      ...otherTechnicalStages('pronto_para_devolucao'),
      'em_devolucao',
    ],
    em_devolucao: ['entregue'],
    entregue: [],
  };

export function canChangeStage(from: RmaItemStage, to: RmaItemStage): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}

/** Etapas de onde se chega a `to`; é o filtro da atualização no banco. */
export function stagesLeadingTo(to: RmaItemStage): RmaItemStage[] {
  return RMA_ITEM_STAGES.filter((from) => canChangeStage(from, to));
}

export function stageChangePermission(to: RmaItemStage): Permission {
  return DISPATCH_STAGES.includes(to) ? 'rma.dispatch' : 'rma.write';
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
