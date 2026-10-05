import { z } from 'zod';
import { uuidSchema } from './common.js';
import { termsVersionSchema } from './legal.js';

/** Base de A4.1: de uma a cinco fotos válidas por equipamento. */
export const PHOTOS_PER_ITEM = { min: 1, max: 5 } as const;

/**
 * Limite de equipamentos por RMA: há chamados com 3 e chamados com 200
 * (decisão de 05/10/2026, revisa a P05). Cada um segue com as suas fotos.
 */
export const MAX_ITEMS_PER_RMA = 200;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((value) => value || undefined);

/** Tamanho máximo dos textos de cada equipamento (também no formulário). */
export const RMA_ITEM_TEXT_LIMITS = {
  model: 80,
  serialNumber: 60,
  reportedFailure: 2000,
  notes: 1000,
} as const;

export const rmaItemInputSchema = z.object({
  model: z
    .string()
    .trim()
    .min(1, 'Informe o modelo')
    .max(RMA_ITEM_TEXT_LIMITS.model),
  serialNumber: z
    .string()
    .trim()
    .min(1, 'Informe o número de série')
    .max(RMA_ITEM_TEXT_LIMITS.serialNumber),
  reportedFailure: z
    .string()
    .trim()
    .min(5, 'Descreva a falha com pelo menos 5 caracteres')
    .max(
      RMA_ITEM_TEXT_LIMITS.reportedFailure,
      `Use no máximo ${RMA_ITEM_TEXT_LIMITS.reportedFailure} caracteres`,
    ),
  notes: optionalText(RMA_ITEM_TEXT_LIMITS.notes),
  warrantyRequested: z.boolean().default(false),
  photoIds: z
    .array(uuidSchema)
    .min(PHOTOS_PER_ITEM.min, 'Envie pelo menos 1 foto do equipamento')
    .max(PHOTOS_PER_ITEM.max, `Envie no máximo ${PHOTOS_PER_ITEM.max} fotos`),
  /** Vídeo opcional mostrando a falha, junto das fotos. */
  videoId: uuidSchema.optional(),
});
export type RmaItemInput = z.infer<typeof rmaItemInputSchema>;

const openingShape = {
  /**
   * Identifica a tentativa de abertura, gerada pelo formulário. Repetir o
   * envio com a mesma chave devolve o RMA já criado, sem duplicar (CA16).
   */
  openingKey: uuidSchema,
  items: z
    .array(rmaItemInputSchema)
    .min(1, 'Inclua pelo menos um equipamento')
    .max(
      MAX_ITEMS_PER_RMA,
      `Inclua no máximo ${MAX_ITEMS_PER_RMA} equipamentos`,
    ),
  invoiceXmlFileId: uuidSchema.optional(),
  declarationFileId: uuidSchema.optional(),
};

type OpeningFields = z.infer<z.ZodObject<typeof openingShape>>;

function checkOpening(value: OpeningFields, ctx: z.RefinementCtx): void {
  if (!value.invoiceXmlFileId && !value.declarationFileId) {
    ctx.addIssue({
      code: 'custom',
      path: ['documents'],
      message: 'Anexe o XML da nota fiscal ou a declaração de conteúdo',
    });
  }
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    for (const photoId of item.photoIds) {
      if (seen.has(photoId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'photoIds'],
          message: 'A mesma foto foi usada em mais de um lugar',
        });
      }
      seen.add(photoId);
    }
  });
}

/** Conteúdo comum às duas aberturas: equipamentos e documentação. */
export const openingContentSchema = z
  .object(openingShape)
  .superRefine(checkOpening);
export type OpeningContent = z.infer<typeof openingContentSchema>;

/**
 * Abertura pelo cliente, sempre para o próprio cadastro. O aceite do termo
 * só vem quando a conta ainda não aceitou a versão vigente (conta criada
 * pela equipe ou termo atualizado); a API confere.
 */
export const openOwnRmaSchema = z
  .object({ ...openingShape, termsVersion: termsVersionSchema.optional() })
  .superRefine(checkOpening);
export type OpenOwnRmaRequest = z.infer<typeof openOwnRmaSchema>;

/** Abertura pela equipe, em nome de um cliente identificado (RN01). */
export const openRmaForCustomerSchema = z
  .object({
    ...openingShape,
    customerId: uuidSchema,
    requesterContactId: uuidSchema,
  })
  .superRefine(checkOpening);
export type OpenRmaForCustomerRequest = z.infer<
  typeof openRmaForCustomerSchema
>;

export interface OpenRmaResponse {
  number: number;
}
