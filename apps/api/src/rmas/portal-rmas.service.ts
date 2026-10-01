import { Inject, Injectable } from '@nestjs/common';
import type {
  ListOwnRmasQuery,
  Page,
  PortalRmaDetail,
  PortalRmaItemView,
  PortalRmaSummary,
  ReceiptView,
  RmaItemStage,
  RmaItemView,
  ShipmentView,
  StaffReceiptView,
  StaffShipmentView,
} from '@central/contracts';
import { count, desc, eq } from 'drizzle-orm';
import { pageWindow, toPage } from '../common/db/pagination.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import { customerContacts, rmas } from '../database/schema/index.js';
import type { FileRow } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { groupBy, itemsOf, loadDetailParts } from './rma-details.js';
import { findRmaFile } from './rma-media.js';
import { cancellationOf, rmaSubject, stageCounts } from './rma-presentation.js';
import { findOwnRma, ownCustomerId, type RmaRow } from './rma-scope.js';

/*
 * Visões do portal por lista explícita de campos: um campo novo só da equipe
 * não chega ao cliente por descuido (RN11).
 */

function toPortalItem(item: RmaItemView): PortalRmaItemView {
  return {
    id: item.id,
    position: item.position,
    model: item.model,
    serialNumber: item.serialNumber,
    reportedFailure: item.reportedFailure,
    notes: item.notes,
    warrantyRequested: item.warrantyRequested,
    stage: item.stage,
    warranty: item.warranty,
    receivedAt: item.receivedAt,
    sla: item.sla,
    photos: item.photos,
    video: item.video,
    validationVideo: item.validationVideo && {
      file: item.validationVideo.file,
      recordedAt: item.validationVideo.recordedAt,
    },
    technicalReport: item.technicalReport,
  };
}

function toPortalShipment(shipment: StaffShipmentView): ShipmentView {
  return {
    id: shipment.id,
    method: shipment.method,
    carrier: shipment.carrier,
    trackingCode: shipment.trackingCode,
    confirmedAt: shipment.confirmedAt,
    itemIds: shipment.itemIds,
  };
}

function toPortalReceipt(receipt: StaffReceiptView): ReceiptView {
  return {
    id: receipt.id,
    receivedAt: receipt.receivedAt,
    itemIds: receipt.itemIds,
  };
}

/** O portal mostra quando e por quê, sem a conta de quem cancelou (RN11). */
function portalCancellation(row: RmaRow) {
  const cancellation = cancellationOf(row);
  return (
    cancellation && {
      cancelledAt: cancellation.cancelledAt,
      reason: cancellation.reason,
    }
  );
}

function summaryOf(
  row: RmaRow,
  items: {
    model: string;
    serialNumber: string;
    stage: RmaItemStage;
  }[],
): PortalRmaSummary {
  return {
    number: row.number,
    subject: rmaSubject(items),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    itemCount: items.length,
    stages: stageCounts(items.map((item) => item.stage)),
    cancellation: portalCancellation(row),
  };
}

/**
 * Atendimentos na visão do cliente: sempre limitados ao próprio cadastro.
 * Registro de outro cliente responde como inexistente (CA04). Nota interna
 * e contas da equipe não saem daqui (RN11).
 */
@Injectable()
export class PortalRmasService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    auth: AuthContext,
    query: ListOwnRmasQuery,
  ): Promise<Page<PortalRmaSummary>> {
    const where = eq(rmas.customerId, ownCustomerId(auth));
    const { limit, offset } = pageWindow(query);
    const rows = await this.db
      .select()
      .from(rmas)
      .where(where)
      .orderBy(desc(rmas.updatedAt), desc(rmas.number))
      .limit(limit)
      .offset(offset);
    const items = rows.length
      ? await itemsOf(
          this.db,
          rows.map((row) => row.id),
        )
      : [];
    const itemsByRma = groupBy(items, (item) => item.rmaId);
    return toPage(
      query,
      Promise.resolve(rows),
      this.db.select({ total: count() }).from(rmas).where(where),
      (row) => summaryOf(row, itemsByRma.get(row.id) ?? []),
    );
  }

  async get(auth: AuthContext, number: number): Promise<PortalRmaDetail> {
    const row = await findOwnRma(this.db, auth, number);
    const [requester] = row.requesterContactId
      ? await this.db
          .select({
            name: customerContacts.name,
            email: customerContacts.email,
            phone: customerContacts.phone,
          })
          .from(customerContacts)
          .where(eq(customerContacts.id, row.requesterContactId))
      : [];
    const parts = await loadDetailParts(this.db, row.id);
    return {
      ...summaryOf(row, parts.items),
      requester: requester ?? null,
      invoices: parts.invoices,
      documents: parts.documents,
      items: parts.items.map(toPortalItem),
      shipments: parts.shipments.map(toPortalShipment),
      receipts: parts.receipts.map(toPortalReceipt),
    };
  }

  async file(
    auth: AuthContext,
    number: number,
    fileId: string,
  ): Promise<FileRow> {
    const row = await findOwnRma(this.db, auth, number);
    const file = await findRmaFile(this.db, row.id, fileId);
    if (!file) throw ApiException.notFound('Arquivo não encontrado.');
    return file;
  }
}
