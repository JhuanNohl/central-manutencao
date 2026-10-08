import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Resultado da validação do XML da nota fiscal (P04). "Não foi possível
 * validar" é falha técnica e nunca se confunde com divergência documental.
 */
export const INVOICE_VALIDATION_STATUSES = [
  'valido',
  'com_divergencias',
  'nao_validado',
] as const;
export type InvoiceValidationStatus =
  (typeof INVOICE_VALIDATION_STATUSES)[number];

export const INVOICE_VALIDATION_STATUS_LABELS: Record<
  InvoiceValidationStatus,
  string
> = {
  valido: 'Válido',
  com_divergencias: 'Com divergências',
  nao_validado: 'Não foi possível validar',
};

export interface InvoiceIssue {
  /** Código estável da regra, ex.: `emitente_cliente`. */
  rule: string;
  message: string;
  /** Divergência que impede a abertura com este arquivo. */
  blocking: boolean;
}

/** Endereço de uma parte da nota (`enderDest`), como foi escrito. */
export interface InvoiceAddress {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
}

/** Dados lidos da NF-e, para conferência. */
export interface InvoiceData {
  number: string;
  series: string | null;
  issuerName: string;
  issuerDocument: string;
  recipientName: string | null;
  recipientDocument: string | null;
  recipientAddress: InvoiceAddress | null;
  cfops: string[];
}

export interface InvoiceValidation {
  status: InvoiceValidationStatus;
  /** Versão da tabela de regras aplicada. */
  rulesVersion: string;
  issues: InvoiceIssue[];
  invoice: InvoiceData | null;
}

/** Resposta da validação durante o preenchimento: vale só para este arquivo. */
export interface InvoiceValidationView extends InvoiceValidation {
  fileId: string;
}

export const validateInvoiceRequestSchema = z.object({
  fileId: uuidSchema,
  /** Obrigatório para a equipe; o cliente valida sempre contra o próprio cadastro. */
  customerId: uuidSchema.optional(),
});
export type ValidateInvoiceRequest = z.infer<
  typeof validateInvoiceRequestSchema
>;
