/* Valores das linhas do chamado importado, montados a partir do plano. */

import type { auditEvents, rmaItems, rmas } from '../database/schema/index.js';
import { reportedFailureOf, requiredText, stageOf } from './legacy-mapping.js';
import type { LegacyEquipmentEvent } from './legacy-source.js';
import type { ItemPlan, TicketPlan } from './ticket-plan.js';

export function rmaRow(plan: TicketPlan): typeof rmas.$inferInsert {
  return {
    customerId: plan.requester.customerId,
    requesterContactId: plan.requester.contactId,
    openedByAccountId: plan.requester.accountId,
    assigneeAccountId: plan.assigneeAccountId,
    priority: plan.priority,
    createdAt: plan.ticket.createdAt,
    updatedAt: plan.ticket.updatedAt,
    closedAt: plan.closedAt,
  };
}

export function itemRow(
  rmaId: string,
  item: ItemPlan,
  slaHours: number,
): typeof rmaItems.$inferInsert {
  const { equipment, dates } = item;
  return {
    rmaId,
    position: item.position,
    model: requiredText(equipment.model),
    serialNumber: requiredText(equipment.serialNumber),
    reportedFailure: reportedFailureOf(equipment),
    notes: equipment.description.trim() || null,
    warrantyRequested: item.warranty !== 'nao_solicitada',
    warranty: item.warranty,
    stage: item.stage,
    receivedAt: dates.receivedAt,
    slaStartedAt: dates.slaStartedAt,
    slaHours: dates.slaStartedAt ? slaHours : null,
    slaFinishedAt: dates.slaFinishedAt,
    technicalReport: equipment.technicalReport?.trim() || null,
    internalNote: equipment.internalNote?.trim() || null,
    createdAt: equipment.createdAt,
    updatedAt: equipment.updatedAt,
  };
}

/** Itens recebidos agrupados pela data, com o agente do evento "recebido". */
export function receiptsOf(
  items: ItemPlan[],
): { receivedAt: Date; staffId: number | undefined; items: ItemPlan[] }[] {
  const byDate = new Map<number, ItemPlan[]>();
  for (const item of items) {
    const at = item.dates.receivedAt?.getTime();
    if (at === undefined) continue;
    byDate.set(at, [...(byDate.get(at) ?? []), item]);
  }
  return [...byDate].map(([at, grouped]) => ({
    receivedAt: new Date(at),
    staffId: grouped
      .flatMap((item) => item.events)
      .find((event) => event.toStatus === 'recebido')?.staffId,
    items: grouped,
  }));
}

/** Evento de situação do legado no formato da troca de etapa daqui. */
export function historyRow(
  rmaId: string,
  itemId: string,
  event: LegacyEquipmentEvent,
  actorAccountId: string | null,
): typeof auditEvents.$inferInsert {
  return {
    occurredAt: event.createdAt,
    actorAccountId,
    action: 'rma.etapa_alterada',
    entityType: 'rma',
    entityId: rmaId,
    data: {
      legado: true,
      stage: stageOf(event.toStatus) ?? event.toStatus,
      before: {
        [itemId]: event.fromStatus
          ? (stageOf(event.fromStatus) ?? event.fromStatus)
          : null,
      },
      note: event.note,
    },
  };
}
