import type { Transaction } from '../database/database.types.js';
import {
  auditEvents,
  rmaDocuments,
  rmaInternalNotes,
  rmaInvoices,
  rmaItemPhotos,
  rmaItems,
  rmaMessages,
  rmaReceiptItems,
  rmaReceipts,
  rmas,
  rmaShipmentItems,
  rmaShipments,
} from '../database/schema/index.js';
import type { ImportSubject } from './import-report.js';
import { insertImportedFile } from './legacy-files.js';
import {
  LEGACY_SOURCES,
  recordLegacy,
  type LegacyRecordInput,
} from './legacy-records.js';
import type { StaffAccounts } from './staff-import.js';
import type { ItemPlan, TicketPlan } from './ticket-plan.js';
import { historyRow, itemRow, receiptsOf, rmaRow } from './ticket-rows.js';

/** O que um ticket gravou, somado ao relatório só depois do commit. */
export type TicketCounts = Partial<Record<ImportSubject, number>>;

/** Itens gravados: id aqui de cada equipamento do legado. */
type ItemIds = Map<number, string>;

class TicketWriter {
  readonly counts: TicketCounts = {};
  private readonly records: LegacyRecordInput[] = [];
  private rmaId = '';
  private readonly itemIds: ItemIds = new Map();

  constructor(
    private readonly tx: Transaction,
    private readonly plan: TicketPlan,
    private readonly staff: StaffAccounts,
    private readonly slaHours: number,
  ) {}

  async write(): Promise<void> {
    await this.writeRma();
    for (const item of this.plan.items) await this.writeItem(item);
    await this.writeReceipts();
    await this.writeShipment();
    await this.writeDocuments();
    await this.writeConversation();
    await this.writeHistory();
    await recordLegacy(this.tx, this.records);
  }

  private add(subject: ImportSubject, amount = 1): void {
    this.counts[subject] = (this.counts[subject] ?? 0) + amount;
  }

  private async writeRma(): Promise<void> {
    const { plan } = this;
    const [rma] = await this.tx
      .insert(rmas)
      .values(rmaRow(plan))
      .returning({ id: rmas.id });
    this.rmaId = rma.id;
    this.records.push({
      sourceTable: LEGACY_SOURCES.ticket,
      sourceId: plan.ticket.id,
      entityType: 'rma',
      entityId: rma.id,
      reference: plan.ticket.number,
    });
    this.add('chamados');
  }

  private async writeItem(item: ItemPlan): Promise<void> {
    const { equipment } = item;
    const [row] = await this.tx
      .insert(rmaItems)
      .values(itemRow(this.rmaId, item, this.slaHours))
      .returning({ id: rmaItems.id });
    this.itemIds.set(equipment.id, row.id);
    this.records.push({
      sourceTable: LEGACY_SOURCES.equipment,
      sourceId: equipment.id,
      entityType: 'rma_item',
      entityId: row.id,
    });
    this.add('equipamentos');
    for (const [index, photo] of item.photos.entries()) {
      const fileId = await insertImportedFile(
        this.tx,
        photo.file,
        'foto_item',
        this.plan.requester.accountId,
        equipment.createdAt,
      );
      await this.tx
        .insert(rmaItemPhotos)
        .values({ itemId: row.id, fileId, position: index + 1 });
      this.records.push({
        sourceTable: LEGACY_SOURCES.photo,
        sourceId: photo.legacyId,
        entityType: 'file',
        entityId: fileId,
      });
      this.add('fotos');
    }
  }

  /** Um recebimento por data, com o agente do evento "recebido", se houver. */
  private async writeReceipts(): Promise<void> {
    for (const receipt of receiptsOf(this.plan.items)) {
      const [row] = await this.tx
        .insert(rmaReceipts)
        .values({
          rmaId: this.rmaId,
          receivedByAccountId: this.staffAccount(receipt.staffId),
          receivedAt: receipt.receivedAt,
          createdAt: receipt.receivedAt,
        })
        .returning({ id: rmaReceipts.id });
      await this.tx.insert(rmaReceiptItems).values(
        receipt.items.map((item) => ({
          receiptId: row.id,
          itemId: this.itemId(item),
        })),
      );
    }
  }

  /** O envio declarado no legado vale para os itens que saíram do cliente. */
  private async writeShipment(): Promise<void> {
    const { shipment } = this.plan;
    const shipped = this.plan.items.filter(
      (item) => item.stage !== 'aguardando_envio',
    );
    if (!shipment || shipped.length === 0) return;
    const [row] = await this.tx
      .insert(rmaShipments)
      .values({
        rmaId: this.rmaId,
        method: shipment.method,
        carrier: shipment.carrier,
        trackingCode: shipment.trackingCode,
        confirmedByAccountId: this.plan.requester.accountId,
        confirmedAt: shipment.confirmedAt,
      })
      .returning({ id: rmaShipments.id });
    await this.tx.insert(rmaShipmentItems).values(
      shipped.map((item) => ({
        shipmentId: row.id,
        itemId: this.itemId(item),
      })),
    );
    this.records.push({
      sourceTable: LEGACY_SOURCES.shipment,
      sourceId: this.plan.ticket.id,
      entityType: 'rma_shipment',
      entityId: row.id,
    });
    this.add('envios');
  }

  private async writeDocuments(): Promise<void> {
    let invoiceDocumentId: string | null = null;
    for (const document of this.plan.documents) {
      const fileId = await insertImportedFile(
        this.tx,
        document.file,
        document.kind,
        this.plan.requester.accountId,
        this.plan.ticket.createdAt,
      );
      const [row] = await this.tx
        .insert(rmaDocuments)
        .values({
          rmaId: this.rmaId,
          kind: document.kind,
          fileId,
          validationStatus: document.validation?.status ?? null,
          rulesVersion: document.validation?.rulesVersion ?? null,
          issues: document.validation?.issues ?? null,
          createdAt: this.plan.ticket.createdAt,
        })
        .returning({ id: rmaDocuments.id });
      if (document.kind === 'nota_xml') invoiceDocumentId = row.id;
      this.records.push({
        sourceTable: LEGACY_SOURCES.ticketFile,
        sourceId: document.legacyId,
        entityType: 'file',
        entityId: fileId,
      });
      this.add('documentos');
    }
    const { invoice } = this.plan;
    if (!invoice) return;
    await this.tx.insert(rmaInvoices).values({
      rmaId: this.rmaId,
      documentId: invoiceDocumentId,
      number: invoice.number,
      issuerName: invoice.issuerName,
      issuerDocument: invoice.issuerDocument,
      createdAt: this.plan.ticket.createdAt,
    });
  }

  private async writeConversation(): Promise<void> {
    for (const message of this.plan.messages) {
      const [row] = await this.tx
        .insert(rmaMessages)
        .values({
          rmaId: this.rmaId,
          authorAccountId: message.authorAccountId,
          authorSide: message.side,
          body: message.body,
          createdAt: message.createdAt,
        })
        .returning({ id: rmaMessages.id });
      if (message.legacyId !== null) {
        this.records.push({
          sourceTable: LEGACY_SOURCES.threadEntry,
          sourceId: message.legacyId,
          entityType: 'rma_message',
          entityId: row.id,
        });
      }
      this.add('mensagens');
    }
    for (const note of this.plan.notes) {
      const [row] = await this.tx
        .insert(rmaInternalNotes)
        .values({ rmaId: this.rmaId, ...note })
        .returning({ id: rmaInternalNotes.id });
      this.records.push({
        sourceTable: LEGACY_SOURCES.threadEntry,
        sourceId: note.legacyId,
        entityType: 'rma_internal_note',
        entityId: row.id,
      });
      this.add('notas internas');
    }
  }

  /** Eventos de situação dos equipamentos, no formato da troca de etapa daqui. */
  private async writeHistory(): Promise<void> {
    const events = this.plan.items.flatMap((item) =>
      item.events.map((event) => ({ item, event })),
    );
    if (events.length === 0) return;
    await this.tx
      .insert(auditEvents)
      .values(
        events.map(({ item, event }) =>
          historyRow(
            this.rmaId,
            this.itemId(item),
            event,
            this.staffAccount(event.staffId),
          ),
        ),
      );
    this.add('histórico', events.length);
  }

  private itemId(item: ItemPlan): string {
    const id = this.itemIds.get(item.equipment.id);
    if (!id) throw new Error(`equipamento ${item.equipment.id} sem registro`);
    return id;
  }

  private staffAccount(staffId: number | undefined): string | null {
    return staffId ? (this.staff.get(staffId) ?? null) : null;
  }
}

/** Grava o ticket planejado; quem chama abre a transação. */
export async function writeTicket(
  tx: Transaction,
  plan: TicketPlan,
  staff: StaffAccounts,
  slaHours: number,
): Promise<TicketCounts> {
  const writer = new TicketWriter(tx, plan, staff, slaHours);
  await writer.write();
  return writer.counts;
}
