import {
  isValidCnpj,
  isValidCpf,
  isValidPhone,
  maskPhone,
  normalizeDocument,
  SLA_FINISHED_STAGES,
  WARRANTY_STATUSES,
  type CustomerKind,
  type RmaItemStage,
  type RmaPriority,
  type ShipmentMethod,
  type WarrantyStatus,
} from '@central/contracts';
import type {
  LegacyEquipment,
  LegacyEquipmentEvent,
  LegacyOrganization,
} from './legacy-source.js';

/**
 * Situação do equipamento no legado → etapa aqui (docs/5-homologacao-e-migracao/5.2-migracao-do-sistema-anterior.md).
 * O legado não tinha diagnóstico nem despacho separados.
 */
const STAGE_BY_LEGACY_STATUS: Record<string, RmaItemStage> = {
  aguardando_envio: 'aguardando_envio',
  recebido: 'recebido',
  aguardando_cliente: 'aguardando_aprovacao',
  em_testes: 'testes',
  concluido: 'finalizado',
};

export function stageOf(legacyStatus: string): RmaItemStage | null {
  return STAGE_BY_LEGACY_STATUS[legacyStatus.trim()] ?? null;
}

/**
 * Prioridade do osTicket, pelo id padrão ou pelo nome. Não há prioridade
 * baixa aqui (decisão de 06/10/2026): ela vira normal.
 */
const PRIORITY_BY_LEGACY: Record<string, RmaPriority> = {
  '1': 'normal',
  low: 'normal',
  baixa: 'normal',
  '2': 'normal',
  normal: 'normal',
  '3': 'alta',
  high: 'alta',
  alta: 'alta',
  '4': 'urgente',
  emergency: 'urgente',
  emergencia: 'urgente',
  urgente: 'urgente',
};

/** Sem prioridade informada, normal; prioridade desconhecida, nulo. */
export function priorityOf(legacy: string | null): RmaPriority | null {
  const key = (legacy ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!key) return 'normal';
  return PRIORITY_BY_LEGACY[key] ?? null;
}

export function warrantyOf(legacy: string): WarrantyStatus | null {
  const value = legacy.trim();
  return (WARRANTY_STATUSES as readonly string[]).includes(value)
    ? (value as WarrantyStatus)
    : null;
}

const CORREIOS = /correio/i;

/** Transportadora do legado: Correios, entrega própria (vazio) ou outra. */
export function shipmentMethodOf(carrier: string): {
  method: ShipmentMethod;
  carrier: string | null;
} {
  const name = carrier.trim();
  if (!name) return { method: 'entrega_propria', carrier: null };
  if (CORREIOS.test(name)) return { method: 'correios', carrier: null };
  return { method: 'transportadora', carrier: name };
}

const CPF_LENGTH = 11;

/** CPF ou CNPJ válido pelas regras do cadastro; nulo se não servir. */
export function customerDocumentOf(
  raw: string | null,
): { document: string; kind: CustomerKind } | null {
  const document = normalizeDocument(raw ?? '');
  if (document.length === CPF_LENGTH && isValidCpf(document)) {
    return { document, kind: 'pessoa_fisica' };
  }
  if (isValidCnpj(document)) return { document, kind: 'pessoa_juridica' };
  return null;
}

/** Telefone no formato da máscara quando é válido; senão, como foi digitado. */
export function contactPhoneOf(raw: string | null): string | null {
  const phone = (raw ?? '').trim();
  if (!phone) return null;
  return isValidPhone(phone) ? maskPhone(phone) : phone;
}

/** Observações internas do cliente: notas do usuário e dados da organização. */
export function customerNotesOf(
  notes: string | null,
  organization: LegacyOrganization | null,
): string | null {
  const parts = [notes?.trim()];
  if (organization) {
    parts.push(
      [
        `Organização no sistema anterior: ${organization.name}`,
        organization.website && `Site: ${organization.website}`,
        organization.phone && `Telefone: ${organization.phone}`,
        organization.address && `Endereço: ${organization.address}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  const body = parts.filter(Boolean).join('\n\n');
  return body || null;
}

const NOT_INFORMED = 'Não informado';

/** Falha relatada: resumo e detalhamento, separados por uma linha em branco. */
export function reportedFailureOf(equipment: LegacyEquipment): string {
  const parts = [equipment.summary.trim(), equipment.details?.trim()].filter(
    Boolean,
  );
  return parts.join('\n\n') || NOT_INFORMED;
}

export function requiredText(value: string): string {
  return value.trim() || NOT_INFORMED;
}

/** Abertura do ticket (assunto e observações) como primeira mensagem do cliente. */
export function openingMessageOf(
  subject: string | null,
  observations: string | null,
): string | null {
  const parts = [
    subject?.trim() && `Assunto: ${subject.trim()}`,
    observations?.trim() && `Observações: ${observations.trim()}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('\n\n') : null;
}

export interface ItemDates {
  receivedAt: Date | null;
  slaStartedAt: Date | null;
  slaFinishedAt: Date | null;
}

const BEFORE_RECEIPT: readonly RmaItemStage[] = ['aguardando_envio', 'enviado'];

/** Primeiro evento do equipamento que chegou à situação dada. */
function firstEventTo(
  events: LegacyEquipmentEvent[],
  status: string,
): Date | null {
  const dates = events
    .filter((event) => event.toStatus === status)
    .map((event) => event.createdAt.getTime());
  return dates.length > 0 ? new Date(Math.min(...dates)) : null;
}

/**
 * Datas que o banco exige para a etapa: o recebimento sai do evento
 * "recebido" e o fim do prazo, do evento "concluido"; sem evento, vale a
 * última atualização do equipamento. O prazo começa no recebimento, já que o
 * legado não tinha a etapa de diagnóstico.
 */
export function itemDatesOf(
  stage: RmaItemStage,
  equipment: LegacyEquipment,
  events: LegacyEquipmentEvent[],
): ItemDates {
  if (BEFORE_RECEIPT.includes(stage)) {
    return { receivedAt: null, slaStartedAt: null, slaFinishedAt: null };
  }
  const receivedAt = firstEventTo(events, 'recebido') ?? equipment.updatedAt;
  const slaStartedAt = stage === 'recebido' ? null : receivedAt;
  const slaFinishedAt = SLA_FINISHED_STAGES.includes(stage)
    ? (firstEventTo(events, 'concluido') ?? equipment.updatedAt)
    : null;
  return { receivedAt, slaStartedAt, slaFinishedAt };
}
