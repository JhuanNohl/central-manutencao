import { z } from 'zod';
import type { Permission, Role } from './authorization.js';
import { emailSchema, opaqueTokenSchema, passwordSchema } from './common.js';
import { contactInputSchema, customerInputSchema } from './customers.js';

export const loginRequestSchema = z.object({
  email: emailSchema,
  // No login não se aplica a política de tamanho: apenas limite superior.
  password: z.string().min(1, 'Informe a senha').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Autocadastro do cliente: cria cliente, contato e conta na mesma transação. */
export const registerRequestSchema = z.object({
  customer: customerInputSchema,
  contact: contactInputSchema.omit({ email: true }),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: opaqueTokenSchema,
  password: passwordSchema,
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

export const emailVerificationConfirmSchema = z.object({
  token: opaqueTokenSchema,
});
export type EmailVerificationConfirm = z.infer<
  typeof emailVerificationConfirmSchema
>;

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
}

export interface MeResponse {
  account: SessionAccount;
}
