import { z } from 'zod';
import {
  emailSchema,
  paginationQuerySchema,
  personNameSchema,
} from './common.js';
import { isValidCnpj, isValidCpf, normalizeDocument } from './documents.js';

export const CUSTOMER_KINDS = ['pessoa_fisica', 'pessoa_juridica'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const phoneSchema = z
  .string()
  .trim()
  .max(30, 'Telefone muito longo')
  .regex(/^[0-9()+\-\s]*$/, 'Telefone inválido');

export const customerInputSchema = z
  .object({
    kind: z.enum(CUSTOMER_KINDS),
    name: z.string().trim().min(2, 'Informe o nome ou razão social').max(200),
    tradeName: z.string().trim().max(200).optional(),
    document: z.string().trim().transform(normalizeDocument),
  })
  .superRefine((value, ctx) => {
    const valid =
      value.kind === 'pessoa_fisica'
        ? isValidCpf(value.document)
        : isValidCnpj(value.document);
    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        path: ['document'],
        message:
          value.kind === 'pessoa_fisica' ? 'CPF inválido' : 'CNPJ inválido',
      });
    }
  });
export type CustomerInput = z.infer<typeof customerInputSchema>;

export const contactInputSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export interface ContactView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hasPortalAccess: boolean;
}

export interface CustomerSummary {
  id: string;
  kind: CustomerKind;
  name: string;
  tradeName: string | null;
  document: string;
  createdAt: string;
}

export interface CustomerView extends CustomerSummary {
  contacts: ContactView[];
}
