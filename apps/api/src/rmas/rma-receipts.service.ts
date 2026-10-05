import { Inject, Injectable } from '@nestjs/common';
import {
  RECEIVABLE_STAGES,
  type RegisterReceiptRequest,
  type StaffReceiptView,
} from '@central/contracts';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Transaction } from '../database/database.types.js';
import {
  rmaItems,
  rmaReceiptItems,
  rmaReceipts,
} from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { itemLine } from './rma-presentation.js';
import { RmaTeamNotices } from './rma-team-notices.js';
import { ensureAllMoved, touchRma } from './rma-movements.js';
import { findRma, lockOpenRma, type RmaRow } from './rma-scope.js';
import { RmaRequesterNotices } from './rma-requester-notices.js';

/**
 * Recebimento físico registrado pelo agente (RF07), só de itens enviados.
 * O prazo de cada um começa depois, na entrada em diagnóstico.
 */
@Injectable()
export class RmaReceiptsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly requester: RmaRequesterNotices,
    private readonly audit: AuditService,
    private readonly team: RmaTeamNotices,
  ) {}

  async register(
    auth: AuthContext,
    number: number,
    request: RegisterReceiptRequest,
  ): Promise<StaffReceiptView> {
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      await lockOpenRma(tx, rma.id);
      const [receipt] = await tx
        .insert(rmaReceipts)
        .values({ rmaId: rma.id, receivedByAccountId: auth.account.id })
        .returning();

      // `received_at is null` torna o recebimento de uso único: repetir ou
      // concorrer não registra a chegada duas vezes (CA16).
      const received = await tx
        .update(rmaItems)
        .set({ stage: 'recebido', receivedAt: receipt.receivedAt })
        .where(
          and(
            eq(rmaItems.rmaId, rma.id),
            inArray(rmaItems.id, request.itemIds),
            isNull(rmaItems.receivedAt),
            inArray(rmaItems.stage, [...RECEIVABLE_STAGES]),
          ),
        )
        .returning();
      ensureAllMoved(
        request.itemIds,
        new Set(received.map((item) => item.id)),
        'Alguns equipamentos já foram recebidos. Confira a seleção.',
      );

      await tx
        .insert(rmaReceiptItems)
        .values(
          request.itemIds.map((itemId) => ({ receiptId: receipt.id, itemId })),
        );
      await touchRma(tx, rma.id);
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.itens_recebidos',
        entityType: 'rma',
        entityId: rma.id,
        data: { receiptId: receipt.id, itemIds: request.itemIds },
      });
      const lines = [...received]
        .sort((a, b) => a.position - b.position)
        .map(itemLine);
      await this.notifyRequester(tx, rma, receipt.id, lines);
      await this.team.notify(tx, rma, 'recebimento', { items: lines });

      return {
        id: receipt.id,
        receivedAt: receipt.receivedAt.toISOString(),
        receivedBy: { id: auth.account.id, name: auth.account.name },
        itemIds: request.itemIds,
      };
    });
  }

  /** Avisa o solicitante; o prazo de cada equipamento começa no diagnóstico. */
  private async notifyRequester(
    tx: Transaction,
    rma: RmaRow,
    receiptId: string,
    lines: string[],
  ): Promise<void> {
    await this.requester.notify(
      tx,
      rma,
      'rma_itens_recebidos',
      { items: lines },
      `rma_itens_recebidos:${receiptId}`,
    );
  }
}
