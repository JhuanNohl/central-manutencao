import { z } from 'zod';

/**
 * Termo de garantia aceito pelo cliente na abertura do atendimento. O texto
 * é da empresa e fica fora do repositório; a API lê o arquivo configurado e
 * grava no RMA a versão aceita, com data e hora (seção de aceite eletrônico).
 */
const lineSchema = z.string().trim().min(1);

const termBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paragraph'), text: lineSchema }),
  z.object({ kind: z.literal('subtitle'), text: lineSchema }),
  z.object({ kind: z.literal('list'), items: z.array(lineSchema).min(1) }),
]);
export type TermBlock = z.infer<typeof termBlockSchema>;

export const warrantyTermsSchema = z.object({
  version: z.string().trim().min(1).max(40),
  title: lineSchema,
  issuer: lineSchema,
  intro: z.array(lineSchema).min(1),
  /** Resumo das principais condições, exibido antes do aceite. */
  summary: z.array(lineSchema).min(1),
  /** Informação destacada sobre cobranças. */
  highlight: z.object({
    title: lineSchema,
    paragraphs: z.array(lineSchema).min(1),
  }),
  sections: z
    .array(z.object({ title: lineSchema, blocks: z.array(termBlockSchema) }))
    .min(1),
  closing: z.string().trim().optional(),
});
export type WarrantyTerms = z.infer<typeof warrantyTermsSchema>;

/** Versão do termo que o cliente leu e aceitou ao abrir o atendimento. */
export const termsVersionSchema = z
  .string({ error: 'Leia e aceite o termo de garantia' })
  .trim()
  .min(1, 'Leia e aceite o termo de garantia')
  .max(40);
