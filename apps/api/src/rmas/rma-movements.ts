import { eq, sql } from 'drizzle-orm';
import { ApiException } from '../common/http/api-exception.js';
import type { Executor } from '../database/database.types.js';
import {
  rmaReceiptItems,
  rmaReceipts,
  rmas,
} from '../database/schema/index.js';

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

/** Recebimento físico: quem recebeu, quando e quais itens chegaram juntos. */
export async function recordReceipt(
  db: Executor,
  input: {
    rmaId: string;
    receivedByAccountId: string;
    receivedAt: Date;
    itemIds: string[];
  },
): Promise<void> {
  const [receipt] = await db
    .insert(rmaReceipts)
    .values({
      rmaId: input.rmaId,
      receivedByAccountId: input.receivedByAccountId,
      receivedAt: input.receivedAt,
    })
    .returning({ id: rmaReceipts.id });
  await db
    .insert(rmaReceiptItems)
    .values(input.itemIds.map((itemId) => ({ receiptId: receipt.id, itemId })));
}

/** A lista de atendimentos é ordenada pela última movimentação. */
export async function touchRma(db: Executor, rmaId: string): Promise<void> {
  await db
    .update(rmas)
    .set({ updatedAt: sql`now()` })
    .where(eq(rmas.id, rmaId));
}
