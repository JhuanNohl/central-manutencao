import { z } from 'zod';

export const uuidSchema = z.uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo')
  .pipe(z.email('E-mail inválido'));

/** Justificativa de uma ação auditada; fica registrada no histórico. */
export const REASON_LENGTH = { min: 3, max: 500 } as const;

export const reasonSchema = z
  .string()
  .trim()
  .min(
    REASON_LENGTH.min,
    `Informe o motivo (mínimo de ${REASON_LENGTH.min} caracteres).`,
  )
  .max(REASON_LENGTH.max);

export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Informe o nome')
  .max(120, 'Nome muito longo');

/** Token opaco enviado por e-mail (convite, redefinição de senha, confirmação). */
export const opaqueTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
