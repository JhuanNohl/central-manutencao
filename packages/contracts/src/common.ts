import { z } from 'zod';

export const uuidSchema = z.uuid();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-mail muito longo')
  .pipe(z.email('E-mail inválido'));

/** Política mínima de senha: comprimento, sem regras de composição (NIST 800-63B). */
export const passwordSchema = z
  .string()
  .min(10, 'A senha deve ter pelo menos 10 caracteres')
  .max(128, 'A senha deve ter no máximo 128 caracteres');

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
