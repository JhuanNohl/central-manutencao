import {
  SLA_DUE_SOON_HOURS,
  SLA_FINISHED_STAGES,
  type ItemSlaView,
  type RmaItemStage,
  type RmaSlaView,
} from '@central/contracts';

const HOUR_MS = 3_600_000;

/**
 * Prazo do item (P01: horas corridas desde o recebimento físico). Nesta
 * etapa não há pausas; quando entrarem, o tempo pausado é descontado aqui,
 * sem um segundo relógio (A6.2).
 */
export function itemSla(
  receivedAt: Date | null,
  slaHours: number | null,
  now: Date,
): ItemSlaView {
  if (!receivedAt || !slaHours) {
    return {
      status: 'nao_iniciado',
      startedAt: null,
      dueAt: null,
      hours: null,
    };
  }
  const dueAt = new Date(receivedAt.getTime() + slaHours * HOUR_MS);
  return {
    status: now.getTime() > dueAt.getTime() ? 'atrasado' : 'no_prazo',
    startedAt: receivedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    hours: slaHours,
  };
}

/**
 * Prazo do chamado: o do item que vence primeiro, porque é ele que pede ação.
 * Itens já despachados não contam (RN08). Nulo sem nenhum prazo em curso.
 */
export function rmaSla(
  items: { stage: RmaItemStage; sla: Pick<ItemSlaView, 'dueAt'> }[],
  now: Date,
): RmaSlaView | null {
  const dueTimes = items.flatMap(({ stage, sla }) =>
    sla.dueAt && !SLA_FINISHED_STAGES.includes(stage)
      ? [Date.parse(sla.dueAt)]
      : [],
  );
  if (dueTimes.length === 0) return null;

  const dueAt = Math.min(...dueTimes);
  return {
    status: rmaSlaStatus(dueAt, now),
    dueAt: new Date(dueAt).toISOString(),
  };
}

function rmaSlaStatus(dueAt: number, now: Date): RmaSlaView['status'] {
  const remaining = dueAt - now.getTime();
  if (remaining < 0) return 'atrasado';
  return remaining <= SLA_DUE_SOON_HOURS * HOUR_MS
    ? 'vence_em_breve'
    : 'no_prazo';
}
