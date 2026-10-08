import {
  PHOTOS_PER_ITEM,
  type InvoiceValidation,
  type RmaDocumentKind,
  type RmaItemStage,
  type RmaPriority,
  type ShipmentMethod,
  type WarrantyStatus,
} from '@central/contracts';
import { validateInvoiceXml } from '../rmas/invoice-xml.js';
import type { ImportedUser, ImportedUsers } from './customer-import.js';
import type { ImportContext } from './import-context.js';
import type { LegacyFiles, PreparedFile } from './legacy-files.js';
import {
  itemDatesOf,
  priorityOf,
  requiredText,
  shipmentMethodOf,
  stageOf,
  warrantyOf,
  type ItemDates,
} from './legacy-mapping.js';
import type {
  LegacyEquipment,
  LegacyEquipmentEvent,
  LegacyTicket,
  LegacyTicketDetails,
  LegacyTicketFile,
} from './legacy-source.js';
import type { StaffAccounts } from './staff-import.js';
import {
  planConversation,
  type ConversationPlan,
} from './ticket-conversation.js';

export interface PhotoPlan {
  legacyId: number;
  file: PreparedFile;
}

export interface ItemPlan {
  equipment: LegacyEquipment;
  position: number;
  stage: RmaItemStage;
  warranty: WarrantyStatus;
  dates: ItemDates;
  photos: PhotoPlan[];
  events: LegacyEquipmentEvent[];
}

export interface DocumentPlan {
  legacyId: number;
  kind: RmaDocumentKind;
  file: PreparedFile;
  /** Validação do XML pelas regras atuais; só na nota. */
  validation: InvoiceValidation | null;
}

export interface InvoicePlan {
  number: string;
  issuerName: string;
  issuerDocument: string;
  /** A nota veio do XML importado (e não só dos campos do legado). */
  fromXml: boolean;
}

export interface ShipmentPlan {
  method: ShipmentMethod;
  carrier: string | null;
  trackingCode: string | null;
  confirmedAt: Date;
}

/** Tudo de um ticket, preparado antes da transação. */
export interface TicketPlan extends ConversationPlan {
  ticket: LegacyTicket;
  requester: ImportedUser;
  assigneeAccountId: string | null;
  priority: RmaPriority;
  closedAt: Date | null;
  items: ItemPlan[];
  documents: DocumentPlan[];
  invoice: InvoicePlan | null;
  shipment: ShipmentPlan | null;
}

/** Tipo do documento do legado → documento aqui. */
const DOCUMENT_KIND_BY_LEGACY: Record<string, RmaDocumentKind> = {
  nf: 'nota_xml',
  dc: 'declaracao',
};

export interface TicketPlanSources {
  ctx: ImportContext;
  files: LegacyFiles;
  users: ImportedUsers;
  staff: StaffAccounts;
}

const byCreation = <T extends { id: number; createdAt: Date }>(a: T, b: T) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;

async function planPhotos(
  sources: TicketPlanSources,
  ticket: LegacyTicket,
  equipment: LegacyEquipment,
  details: LegacyTicketDetails,
): Promise<PhotoPlan[]> {
  const photos = details.photos
    .filter((photo) => photo.equipmentId === equipment.id)
    .sort((a, b) => a.slot - b.slot || a.id - b.id);
  const source = `ticket ${ticket.number}`;
  if (photos.length > PHOTOS_PER_ITEM.max) {
    sources.ctx.report.warn(
      source,
      `equipamento ${equipment.id} tem ${photos.length} fotos; entram as ${PHOTOS_PER_ITEM.max} primeiras`,
    );
  }
  const planned: PhotoPlan[] = [];
  for (const photo of photos.slice(0, PHOTOS_PER_ITEM.max)) {
    const file = await sources.files.prepare(photo.fileId, 'foto_item');
    if ('problem' in file) {
      sources.ctx.report.warn(source, `foto ${photo.id}: ${file.problem}`);
      continue;
    }
    planned.push({ legacyId: photo.id, file });
  }
  return planned;
}

async function planItems(
  sources: TicketPlanSources,
  ticket: LegacyTicket,
  details: LegacyTicketDetails,
): Promise<ItemPlan[]> {
  const equipment = [...details.equipment].sort(
    (a, b) => a.sequence - b.sequence || a.id - b.id,
  );
  const items: ItemPlan[] = [];
  for (const [index, item] of equipment.entries()) {
    const stage = stageOf(item.status);
    if (!stage) {
      throw new Error(
        `equipamento ${item.id} com situação desconhecida "${item.status}"`,
      );
    }
    const warranty = warrantyOf(item.warranty);
    if (!warranty) {
      sources.ctx.report.warn(
        `ticket ${ticket.number}`,
        `garantia "${item.warranty}" do equipamento ${item.id} entrou como não solicitada`,
      );
    }
    const events = details.events
      .filter((event) => event.equipmentId === item.id)
      .sort(byCreation);
    items.push({
      equipment: item,
      position: index + 1,
      stage,
      warranty: warranty ?? 'nao_solicitada',
      dates: itemDatesOf(stage, item, events),
      photos: await planPhotos(sources, ticket, item, details),
      events,
    });
  }
  return items;
}

/** Um documento de cada tipo: com mais de um, vale o mais recente. */
function latestByKind(files: LegacyTicketFile[]): LegacyTicketFile[] {
  const latest = new Map<string, LegacyTicketFile>();
  for (const file of [...files].sort(byCreation)) latest.set(file.kind, file);
  return [...latest.values()];
}

async function planDocuments(
  sources: TicketPlanSources,
  ticket: LegacyTicket,
  requester: ImportedUser,
  details: LegacyTicketDetails,
): Promise<{ documents: DocumentPlan[]; invoice: InvoicePlan | null }> {
  const source = `ticket ${ticket.number}`;
  const documents: DocumentPlan[] = [];
  let invoice: InvoicePlan | null = null;
  for (const legacy of latestByKind(details.files)) {
    const kind = DOCUMENT_KIND_BY_LEGACY[legacy.kind];
    if (!kind) {
      sources.ctx.report.warn(
        source,
        `documento ${legacy.id} de tipo "${legacy.kind}" ignorado`,
      );
      continue;
    }
    if (kind === 'nota_xml' && legacy.invoiceNumber) {
      invoice = {
        number: legacy.invoiceNumber,
        issuerName: requiredText(legacy.invoiceIssuerName ?? ''),
        issuerDocument: requester.document,
        fromXml: false,
      };
    }
    const file = await sources.files.prepare(legacy.fileId, kind);
    if ('problem' in file) {
      sources.ctx.report.warn(
        source,
        `documento ${legacy.id}: ${file.problem}; fica só no backup do legado`,
      );
      continue;
    }
    const validation =
      kind === 'nota_xml'
        ? validateInvoiceXml(file.content, {
            customerDocument: requester.document,
            recipientDocument: sources.ctx.options.invoiceRecipientDocument,
            recipientAddress: sources.ctx.options.invoiceRecipientAddress,
          })
        : null;
    if (validation?.invoice) {
      invoice = {
        number: validation.invoice.number,
        issuerName: validation.invoice.issuerName,
        issuerDocument: validation.invoice.issuerDocument,
        fromXml: true,
      };
    }
    documents.push({ legacyId: legacy.id, kind, file, validation });
  }
  return { documents, invoice };
}

function planShipment(details: LegacyTicketDetails): ShipmentPlan | null {
  if (!details.shipment) return null;
  const { method, carrier } = shipmentMethodOf(details.shipment.carrier);
  return {
    method,
    carrier,
    trackingCode: details.shipment.trackingCode.trim() || null,
    confirmedAt: details.shipment.confirmedAt ?? details.shipment.updatedAt,
  };
}

/**
 * Prepara o ticket inteiro: lê tudo do legado e grava as cópias dos arquivos
 * antes da transação, que fica curta e só com o banco.
 */
export async function planTicket(
  sources: TicketPlanSources,
  ticket: LegacyTicket,
  requester: ImportedUser,
): Promise<TicketPlan> {
  const { ctx } = sources;
  const details = await ctx.source.ticketDetails(ticket.id);
  const source = `ticket ${ticket.number}`;
  const priority = priorityOf(ticket.priority);
  if (!priority) {
    ctx.report.warn(
      source,
      `prioridade "${ticket.priority}" entrou como normal`,
    );
  }
  const assigneeAccountId =
    ticket.staffId > 0 ? (sources.staff.get(ticket.staffId) ?? null) : null;
  if (ticket.staffId > 0 && !assigneeAccountId) {
    ctx.report.warn(
      source,
      `responsável (staff_id ${ticket.staffId}) sem conta; ficou sem responsável`,
    );
  }
  const items = await planItems(sources, ticket, details);
  const { documents, invoice } = await planDocuments(
    sources,
    ticket,
    requester,
    details,
  );
  return {
    ticket,
    requester,
    assigneeAccountId,
    priority: priority ?? 'normal',
    closedAt: ticket.closed ? (ticket.closedAt ?? ticket.updatedAt) : null,
    items,
    documents,
    invoice,
    shipment: planShipment(details),
    ...planConversation(
      {
        ticket,
        requester,
        users: sources.users,
        staff: sources.staff,
        report: ctx.report,
      },
      details.entries,
    ),
  };
}
