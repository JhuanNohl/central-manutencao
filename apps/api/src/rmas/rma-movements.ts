import { eq, sql } from 'drizzle-orm';
import { ApiException } from '../common/http/api-exception.js';
import type { Executor } from '../database/database.types.js';
import { rmas } from '../database/schema/index.js';

/**
 * Movimentação de itens é tudo ou nada: se algum item selecionado deixou de
 * ser elegível (outra pessoa agiu antes, outro RMA), nada é gravado e a
 * resposta aponta cada item, para o formulário atualizar a seleção (5.5).
 */
export function ensureAllMoved(
  requested: string[],
  moved: Set<string>,
  message: string,
): void {
  const issues = requested.flatMap((id, index) =>
    moved.has(id)
      ? []
      : [
          {
            path: `itemIds.${index}`,
            message: 'Equipamento indisponível para esta operação',
          },
        ],
  );
  if (issues.length > 0) throw ApiException.conflict(message, issues);
}

/** A lista de atendimentos é ordenada pela última movimentação. */
export async function touchRma(db: Executor, rmaId: string): Promise<void> {
  await db
    .update(rmas)
    .set({ updatedAt: sql`now()` })
    .where(eq(rmas.id, rmaId));
}
