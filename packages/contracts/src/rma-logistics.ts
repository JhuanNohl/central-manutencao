import { z } from 'zod';
import { uuidSchema } from './common.js';
import { MAX_ITEMS_PER_RMA } from './rma-opening.js';

/** Modalidades de envio à fábrica (PC06, proposta de 28/09/2026). */
export const SHIPMENT_METHODS = [
  'transportadora',
  'correios',
  'entrega_propria',
] as const;
export type ShipmentMethod = (typeof SHIPMENT_METHODS)[number];

export interface ShipmentMethodRule {
  label: string;
  /** Exige o nome da transportadora. O rastreio é sempre opcional. */
  requiresCarrier: boolean;
}

export const SHIPMENT_METHOD_RULES: Record<ShipmentMethod, ShipmentMethodRule> =
  {
    transportadora: { label: 'Transportadora', requiresCarrier: true },
    correios: { label: 'Correios', requiresCarrier: false },
    entrega_propria: { label: 'Entrega própria', requiresCarrier: false },
  };

/** Equipamentos escolhidos para uma operação, sem repetição. */
export const itemSelectionSchema = z
  .array(uuidSchema)
  .min(1, 'Selecione pelo menos um equipamento')
  .max(MAX_ITEMS_PER_RMA)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Equipamento repetido na seleção',
  );

/** Cliente confirma o envio dos itens selecionados; o prazo ainda não começa (RN04). */
/** Tamanho máximo da transportadora e do rastreio (também no formulário). */
export const SHIPMENT_TEXT_LIMITS = { carrier: 120, trackingCode: 60 } as const;

export const confirmShipmentSchema = z
  .object({
    itemIds: itemSelectionSchema,
    method: z.enum(SHIPMENT_METHODS),
    carrier: z
      .string()
      .trim()
      .max(SHIPMENT_TEXT_LIMITS.carrier)
      .optional()
      .transform((value) => value || undefined),
    trackingCode: z
      .string()
      .trim()
      .max(SHIPMENT_TEXT_LIMITS.trackingCode)
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((value, ctx) => {
    if (SHIPMENT_METHOD_RULES[value.method].requiresCarrier && !value.carrier) {
      ctx.addIssue({
        code: 'custom',
        path: ['carrier'],
        message: 'Informe a transportadora',
      });
    }
  });
export type ConfirmShipmentRequest = z.infer<typeof confirmShipmentSchema>;

/** Agente registra os itens fisicamente recebidos; cada um inicia o próprio prazo. */
export const registerReceiptSchema = z.object({ itemIds: itemSelectionSchema });
export type RegisterReceiptRequest = z.infer<typeof registerReceiptSchema>;

export interface ShipmentView {
  id: string;
  method: ShipmentMethod;
  carrier: string | null;
  trackingCode: string | null;
  confirmedAt: string;
  itemIds: string[];
}

export interface ReceiptView {
  id: string;
  receivedAt: string;
  itemIds: string[];
}

/** Na visão da equipe, cada movimentação identifica quem a registrou. */
export interface StaffShipmentView extends ShipmentView {
  confirmedBy: { id: string; name: string } | null;
}

export interface StaffReceiptView extends ReceiptView {
  receivedBy: { id: string; name: string } | null;
}
