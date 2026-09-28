import type { ItemSlaView } from '@central/contracts';

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
