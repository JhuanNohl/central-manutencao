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
