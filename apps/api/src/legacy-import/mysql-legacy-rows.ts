import type { RowDataPacket } from 'mysql2/promise';
import type {
  LegacyEquipment,
  LegacyEquipmentEvent,
  LegacyEquipmentPhoto,
  LegacyShipment,
  LegacyThreadEntry,
  LegacyTicketFile,
} from './legacy-source.js';

/** Data "zerada" que o MySQL aceita no lugar de nulo. */
const ZERO_DATE = /^0000-00-00/;

/** Texto de uma coluna: o driver entrega texto, número ou, em BLOB, bytes. */
export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return String(value as string | number);
}

/**
 * Linhas do banco do osTicket → dados da importação. As datas chegam como
 * texto (`dateStrings`) e são lidas no fuso do legado (`utcOffset`).
 */
export class LegacyRows {
  constructor(private readonly utcOffset: string) {}

  date(value: unknown): Date | null {
    const raw = text(value);
    if (!raw || ZERO_DATE.test(raw)) return null;
    return new Date(`${raw.replace(' ', 'T')}${this.utcOffset}`);
  }

  requiredDate(value: unknown): Date {
    const date = this.date(value);
    if (!date) {
      throw new Error(`data obrigatória ausente no legado: ${text(value)}`);
    }
    return date;
  }

  equipment(row: RowDataPacket): LegacyEquipment {
    return {
      id: Number(row.id),
      sequence: Number(row.seq),
      model: String(row.modelo),
      serialNumber: String(row.numero_serie),
      summary: String(row.resumo),
      details: text(row.detalhamento),
      description: String(row.descricao),
      status: String(row.status),
      warranty: String(row.garantia),
      technicalReport: text(row.laudo),
      internalNote: text(row.nota_interna),
      createdAt: this.requiredDate(row.created),
      updatedAt: this.requiredDate(row.updated),
    };
  }

  event(row: RowDataPacket): LegacyEquipmentEvent {
    return {
      id: Number(row.id),
      equipmentId: Number(row.equipment_id),
      fromStatus: text(row.from_status),
      toStatus: String(row.to_status),
      note: text(row.note),
      staffId: Number(row.staff_id),
      createdAt: this.requiredDate(row.created),
    };
  }

  photo(row: RowDataPacket): LegacyEquipmentPhoto {
    return {
      id: Number(row.id),
      equipmentId: Number(row.equipment_id),
      fileId: Number(row.file_id),
      slot: Number(row.slot),
    };
  }

  ticketFile(row: RowDataPacket): LegacyTicketFile {
    return {
      id: Number(row.id),
      fileId: Number(row.file_id),
      kind: String(row.kind),
      errors: text(row.errors),
      invoiceNumber: text(row.nf_numero),
      invoiceIssuerName: text(row.nf_razao_social),
      createdAt: this.requiredDate(row.created),
    };
  }

  shipment(row: RowDataPacket): LegacyShipment {
    return {
      carrier: String(row.transportadora),
      trackingCode: String(row.rastreio),
      confirmedAt: this.date(row.confirmado),
      updatedAt: this.requiredDate(row.updated),
    };
  }

  entry(row: RowDataPacket): LegacyThreadEntry {
    return {
      id: Number(row.id),
      type: String(row.type),
      staffId: Number(row.staff_id),
      userId: Number(row.user_id),
      poster: String(row.poster),
      body: text(row.body) ?? '',
      format: String(row.format),
      createdAt: this.requiredDate(row.created),
    };
  }
}
