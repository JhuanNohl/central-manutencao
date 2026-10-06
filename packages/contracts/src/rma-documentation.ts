import { z } from 'zod';
import { uuidSchema } from './common.js';

/**
 * Pendência de documentação do chamado. A abertura já exige XML válido ou
 * declaração; a pendência aparece nos chamados vindos do sistema anterior
 * (nota com erro ou sem nota) e se resolve com o envio da documentação.
 */
export const DOCUMENTATION_PENDING_REASONS = [
  'sem_documentacao',
  'nf_com_divergencias',
] as const;
export type DocumentationPendingReason =
  (typeof DOCUMENTATION_PENDING_REASONS)[number];

export const DOCUMENTATION_PENDING_LABELS: Record<
  DocumentationPendingReason,
  string
> = {
  sem_documentacao: 'Sem nota fiscal nem declaração',
  nf_com_divergencias: 'Nota fiscal com divergências',
};

/** Pendência do chamado aberto; chamado encerrado não tem pendência. */
export function documentationPending(state: {
  closed: boolean;
  documentCount: number;
  divergentInvoice: boolean;
}): DocumentationPendingReason | null {
  if (state.closed) return null;
  if (state.documentCount === 0) return 'sem_documentacao';
  return state.divergentInvoice ? 'nf_com_divergencias' : null;
}

export const DOCUMENTS_REQUIRED_MESSAGE =
  'Anexe o XML da nota fiscal ou a declaração de conteúdo';

/**
 * Documentação enviada depois da abertura, para resolver a pendência: XML da
 * nota (validado como na abertura) e/ou declaração de conteúdo.
 */
export const sendRmaDocumentsSchema = z
  .object({
    invoiceXmlFileId: uuidSchema.optional(),
    declarationFileId: uuidSchema.optional(),
  })
  .refine((value) => value.invoiceXmlFileId || value.declarationFileId, {
    path: ['documents'],
    message: DOCUMENTS_REQUIRED_MESSAGE,
  });
export type SendRmaDocumentsRequest = z.infer<typeof sendRmaDocumentsSchema>;
