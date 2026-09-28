import { z } from 'zod';
import { uuidSchema } from './common.js';

/** Base de A4.1: de uma a cinco fotos válidas por equipamento. */
export const PHOTOS_PER_ITEM = { min: 1, max: 5 } as const;

/** Limite de equipamentos por RMA (P05, proposta de 28/09/2026). */
export const MAX_ITEMS_PER_RMA = 20;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .optional()
    .transform((value) => value || undefined);

export const rmaItemInputSchema = z.object({
  model: z.string().trim().min(1, 'Informe o modelo').max(80),
  serialNumber: z.string().trim().min(1, 'Informe o número de série').max(60),
  reportedFailure: z
    .string()
    .trim()
    .min(5, 'Descreva a falha com pelo menos 5 caracteres')
    .max(2000, 'Use no máximo 2000 caracteres'),
  notes: optionalText(1000),
  warrantyRequested: z.boolean().default(false),
  photoIds: z
    .array(uuidSchema)
    .min(PHOTOS_PER_ITEM.min, 'Envie pelo menos 1 foto do equipamento')
    .max(PHOTOS_PER_ITEM.max, `Envie no máximo ${PHOTOS_PER_ITEM.max} fotos`),
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

/** Abertura pelo cliente, sempre para o próprio cadastro. */
export const openOwnRmaSchema = z
  .object(openingShape)
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
