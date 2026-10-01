import { Inject, Injectable } from '@nestjs/common';
import {
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
import { findOwnRma, lockOpenRma } from './rma-scope.js';

/**
 * Envio à fábrica declarado pelo cliente (RF06). Os itens passam a "em
 * transporte"; o prazo só começa no recebimento físico (RN04, CA06).
 */
@Injectable()
export class RmaShipmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
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
        .returning({ id: rmaItems.id });
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
