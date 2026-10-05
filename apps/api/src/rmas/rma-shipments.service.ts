import { Inject, Injectable } from '@nestjs/common';
import {
  RMA_ITEM_STAGE_LABELS,
  SHIPMENT_METHOD_RULES,
  SHIPPABLE_STAGES,
  type ConfirmShipmentRequest,
  type ShipmentView,
} from '@central/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import {
  rmaItems,
  rmaShipmentItems,
  rmaShipments,
} from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { ensureAllMoved, touchRma } from './rma-movements.js';
import { itemLine } from './rma-presentation.js';
import { RmaRequesterNotices } from './rma-requester-notices.js';
import { findOwnRma, lockOpenRma } from './rma-scope.js';
import { RmaTeamNotices } from './rma-team-notices.js';

/** Modalidade, transportadora e rastreio, como o setor precisa para conferir. */
function shippingLine(request: ConfirmShipmentRequest): string {
  const method = SHIPMENT_METHOD_RULES[request.method].label;
  const carrier = request.carrier ? ` (${request.carrier})` : '';
  const tracking = request.trackingCode
    ? ` · rastreio ${request.trackingCode}`
    : '';
  return `Envio: ${method}${carrier}${tracking}`;
}

/**
 * Envio à fábrica declarado pelo cliente (RF06). Os itens passam a
 * "enviado"; o prazo só começa no diagnóstico (RN04, CA06). O cliente recebe a
 * confirmação e o setor fica sabendo do envio.
 */
@Injectable()
export class RmaShipmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly requester: RmaRequesterNotices,
    private readonly team: RmaTeamNotices,
  ) {}

  async confirm(
    auth: AuthContext,
    number: number,
    request: ConfirmShipmentRequest,
  ): Promise<ShipmentView> {
    const rma = await findOwnRma(this.db, auth, number);
    return this.db.transaction(async (tx) => {
      await lockOpenRma(tx, rma.id);
      const moved = await tx
        .update(rmaItems)
        .set({ stage: 'enviado' })
        .where(
          and(
            eq(rmaItems.rmaId, rma.id),
            inArray(rmaItems.id, request.itemIds),
            inArray(rmaItems.stage, [...SHIPPABLE_STAGES]),
          ),
        )
        .returning({
          id: rmaItems.id,
          position: rmaItems.position,
          model: rmaItems.model,
          serialNumber: rmaItems.serialNumber,
        });
      ensureAllMoved(
        request.itemIds,
        new Set(moved.map((item) => item.id)),
        'Alguns equipamentos já foram enviados. Confira a seleção.',
      );

      const [shipment] = await tx
        .insert(rmaShipments)
        .values({
          rmaId: rma.id,
          method: request.method,
          carrier: request.carrier ?? null,
          trackingCode: request.trackingCode ?? null,
          confirmedByAccountId: auth.account.id,
        })
        .returning();
      await tx.insert(rmaShipmentItems).values(
        request.itemIds.map((itemId) => ({
          shipmentId: shipment.id,
          itemId,
        })),
      );
      await touchRma(tx, rma.id);
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.envio_confirmado',
        entityType: 'rma',
        entityId: rma.id,
        data: {
          shipmentId: shipment.id,
          method: request.method,
          itemIds: request.itemIds,
        },
      });
      const items = [...moved]
        .sort((a, b) => a.position - b.position)
        .map(itemLine);
      await this.requester.notify(tx, rma, 'rma_etapa_alterada', {
        items: items.map((item) => `${item}: ${RMA_ITEM_STAGE_LABELS.enviado}`),
      });
      await this.team.notify(tx, rma, 'envio', {
        items,
        shipping: shippingLine(request),
      });
      return {
        id: shipment.id,
        method: shipment.method,
        carrier: shipment.carrier,
        trackingCode: shipment.trackingCode,
        confirmedAt: shipment.confirmedAt.toISOString(),
        itemIds: request.itemIds,
      };
    });
  }
}
