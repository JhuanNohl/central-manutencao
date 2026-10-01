import { Inject, Injectable } from '@nestjs/common';
import {
  RMA_ITEM_STAGE_LABELS,
  SLA_END_STAGE,
  SLA_START_STAGE,
  requiresValidationVideo,
  stageChangePermission,
  stagesChangeableTo,
  type ChangeItemStageRequest,
  type ItemStageChangeView,
  type RmaItemStage,
} from '@central/contracts';
import { and, eq, inArray, ne, notExists } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Transaction } from '../database/database.types.js';
import {
  rmaItems,
  rmas,
  rmaValidationVideos,
} from '../database/schema/index.js';
import { can, type AuthContext } from '../identity/auth-context.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { findRequesterContact } from './rma-customer.js';
import type { ItemRow } from './rma-details.js';
import { ensureAllMoved, touchRma } from './rma-movements.js';
import { findRma, lockOpenRma, type RmaRow } from './rma-scope.js';
import { itemSla } from './sla.js';

/**
 * Mudança de etapa dos itens pela equipe: só o próximo passo de `NEXT_STAGES`,
 * sem voltar. Cada item muda sozinho (A5.1). O prazo começa no diagnóstico e
 * termina na devolução; o chamado se encerra quando todos chegam ao cliente.
 */
@Injectable()
export class RmaStagesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  async change(
    auth: AuthContext,
    number: number,
    request: ChangeItemStageRequest,
  ): Promise<ItemStageChangeView> {
    const sources = stagesChangeableTo(request.stage);
    if (sources.length === 0) {
      throw ApiException.validation([
        {
          path: 'stage',
          message: 'Esta etapa não é o próximo passo de nenhum equipamento',
        },
      ]);
    }
    if (!can(auth, stageChangePermission(request.stage))) {
      throw ApiException.forbidden();
    }
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      await lockOpenRma(tx, rma.id);
      if (requiresValidationVideo(request.stage)) {
        await this.ensureValidationVideos(tx, request.itemIds);
      }
      const before = await tx
        .select({ id: rmaItems.id, stage: rmaItems.stage })
        .from(rmaItems)
        .where(
          and(
            eq(rmaItems.rmaId, rma.id),
            inArray(rmaItems.id, request.itemIds),
          ),
        );
      const moved = await tx
        .update(rmaItems)
        .set({ stage: request.stage, ...this.slaChange(request.stage) })
        .where(
          and(
            eq(rmaItems.rmaId, rma.id),
            inArray(rmaItems.id, request.itemIds),
            inArray(rmaItems.stage, sources),
          ),
        )
        .returning();
      ensureAllMoved(
        request.itemIds,
        new Set(moved.map((item) => item.id)),
        'Alguns equipamentos não podem ir para esta etapa. Confira a seleção.',
      );

      if (request.stage === 'finalizado') {
        await this.closeIfAllDelivered(tx, rma);
      }
      await touchRma(tx, rma.id);
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.etapa_alterada',
        entityType: 'rma',
        entityId: rma.id,
        data: {
          stage: request.stage,
          before: Object.fromEntries(
            before.map((item) => [item.id, item.stage]),
          ),
        },
      });
      await this.notifyRequester(tx, rma, moved);

      return {
        stage: request.stage,
        itemIds: request.itemIds,
        changedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * O diagnóstico inicia o prazo, com a duração configurada naquele momento
   * gravada no item (CA15); a devolução o encerra (RN08).
   */
  private slaChange(stage: RmaItemStage) {
    const now = new Date();
    if (stage === SLA_START_STAGE) {
      return { slaStartedAt: now, slaHours: this.env.RMA_SLA_HOURS };
    }
    if (stage === SLA_END_STAGE) return { slaFinishedAt: now };
    return {};
  }

  /**
   * Sob o bloqueio do RMA, nenhum vídeo muda entre esta conferência e o
   * despacho. Aponta cada item sem vídeo, como nas movimentações.
   */
  private async ensureValidationVideos(tx: Transaction, itemIds: string[]) {
    const recorded = await tx
      .select({ itemId: rmaValidationVideos.itemId })
      .from(rmaValidationVideos)
      .where(inArray(rmaValidationVideos.itemId, itemIds));
    const withVideo = new Set(recorded.map((row) => row.itemId));
    const issues = itemIds.flatMap((id, index) =>
      withVideo.has(id)
        ? []
        : [
            {
              path: `itemIds.${index}`,
              message: 'Anexe o vídeo de comprovação deste equipamento',
            },
          ],
    );
    if (issues.length > 0) {
      throw ApiException.conflict(
        'Anexe o vídeo de comprovação de cada equipamento antes da devolução.',
        issues,
      );
    }
  }

  private async closeIfAllDelivered(tx: Transaction, rma: RmaRow) {
    await tx
      .update(rmas)
      .set({ closedAt: new Date() })
      .where(
        and(
          eq(rmas.id, rma.id),
          notExists(
            tx
              .select({ id: rmaItems.id })
              .from(rmaItems)
              .where(
                and(
                  eq(rmaItems.rmaId, rma.id),
                  ne(rmaItems.stage, 'finalizado'),
                ),
              ),
          ),
        ),
      );
  }

  /** O solicitante acompanha cada mudança; a nota interna não entra no aviso. */
  private async notifyRequester(
    tx: Transaction,
    rma: RmaRow,
    items: ItemRow[],
  ): Promise<void> {
    const requester = await findRequesterContact(tx, rma);
    if (!requester) return;
    const lines = [...items]
      .sort((a, b) => a.position - b.position)
      .map((item) => {
        const line = `${item.model} (S/N ${item.serialNumber}): ${RMA_ITEM_STAGE_LABELS[item.stage]}`;
        // No diagnóstico, o solicitante fica sabendo até quando vai o prazo.
        const { dueAt } = itemSla(item, new Date());
        return item.stage === SLA_START_STAGE && dueAt
          ? `${line} · prazo até ${this.links.expiry(new Date(dueAt))}`
          : line;
      });
    await this.notifications.enqueue(tx, {
      template: 'rma_etapa_alterada',
      recipient: requester.email,
      payload: {
        name: requester.name,
        number: String(rma.number),
        items: lines,
        link: this.links.portalRma(rma.number),
      },
      origin: `rma:${rma.id}`,
    });
  }
}
