import { z } from 'zod';
import type { Permission, Role } from './authorization.js';
import { emailSchema, opaqueTokenSchema } from './common.js';
import { contactInputSchema, customerInputSchema } from './customers.js';
import { termsVersionSchema } from './legal.js';
import { passwordSchema } from './passwords.js';

export const loginRequestSchema = z.object({
  email: emailSchema,
  // No login não se aplica a política de tamanho: apenas limite superior.
  password: z.string().min(1, 'Informe a senha').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Autocadastro do cliente: cria cliente, contato e conta na mesma transação,
 * com o aceite do termo de garantia. A conta já nasce ativa (02/10/2026).
 */
export const registerRequestSchema = z.object({
  customer: customerInputSchema,
  contact: contactInputSchema.omit({ email: true }),
  email: emailSchema,
  password: passwordSchema,
  termsVersion: termsVersionSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Validade do link de redefinição de senha, também informada na tela. */
export const PASSWORD_RESET_TTL_HOURS = 1;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: opaqueTokenSchema,
  password: passwordSchema,
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export interface SessionAccount {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: Permission[];
  emailVerified: boolean;
  /** Presente apenas para contas de cliente. */
  customer: { id: string; name: string } | null;
  /**
   * Conta criada pela equipe com senha provisória: até trocá-la, a API só
   * aceita a troca de senha, a consulta da sessão e a saída.
   */
  passwordChangeRequired: boolean;
  /** Versão do termo de garantia aceita pela conta; `null` se nunca aceitou. */
  acceptedTermsVersion: string | null;
}

export interface MeResponse {
  account: SessionAccount;
}
