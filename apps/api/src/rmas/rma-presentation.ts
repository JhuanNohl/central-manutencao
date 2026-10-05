import {
  RMA_ITEM_STAGES,
  type RmaCancellationView,
  type RmaItemStage,
  type RmaStageCount,
} from '@central/contracts';
import { reference } from '../common/mapping.js';

/**
 * Assunto exibido na lista, derivado dos itens (não é digitado):
 * um item → "Manutenção — VR10 (S/N 123)";
 * vários → "Manutenção — 3 equipamentos: 2× SpeedFace V5L, Inbio 260".
 */
export function rmaSubject(
  items: { model: string; serialNumber: string }[],
): string {
  if (items.length === 0) return 'Manutenção — sem equipamentos';
  if (items.length === 1) {
    const [item] = items;
    return `Manutenção — ${item.model} (S/N ${item.serialNumber})`;
  }
  const perModel = new Map<string, number>();
  for (const { model } of items) {
    perModel.set(model, (perModel.get(model) ?? 0) + 1);
  }
  const models = [...perModel].map(([model, count]) =>
    count > 1 ? `${count}× ${model}` : model,
  );
  return `Manutenção — ${items.length} equipamentos: ${models.join(', ')}`;
}

/** Equipamento como aparece nos avisos: "VR10 (S/N 123)". */
export function itemLine(item: {
  model: string;
  serialNumber: string;
}): string {
  return `${item.model} (S/N ${item.serialNumber})`;
}

/** Modelos distintos do chamado, na ordem em que os itens aparecem. */
export function distinctModels(items: { model: string }[]): string[] {
  return [...new Set(items.map((item) => item.model))];
}

/** Quantidade de itens por etapa, na ordem do fluxo (A5.1). */
export function stageCounts(stages: RmaItemStage[]): RmaStageCount[] {
  return RMA_ITEM_STAGES.map((stage) => ({
    stage,
    count: stages.filter((current) => current === stage).length,
  })).filter(({ count }) => count > 0);
}

/** Cancelamento do chamado: quando, por quê e, para a equipe, por quem. */
export function cancellationOf(row: {
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancelledById?: string | null;
  cancelledByName?: string | null;
}): RmaCancellationView | null {
  if (!row.cancelledAt || row.cancellationReason === null) return null;
  return {
    cancelledAt: row.cancelledAt.toISOString(),
    reason: row.cancellationReason,
    cancelledBy: reference(
      row.cancelledById ?? null,
      row.cancelledByName ?? null,
    ),
  };
}
