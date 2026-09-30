import { z } from 'zod';
import { ROLES, STAFF_ROLES, type Role } from './authorization.js';
import { paginationQuerySchema, reasonSchema } from './common.js';

export const ACCOUNT_STATUSES = ['ativa', 'desativada'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const listAccountsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;

export const changeRoleSchema = z.object({
  role: z.enum(STAFF_ROLES),
  reason: reasonSchema,
});
export type ChangeRoleRequest = z.infer<typeof changeRoleSchema>;

export const accountStatusChangeSchema = z.object({
  reason: reasonSchema,
});
export type AccountStatusChangeRequest = z.infer<
  typeof accountStatusChangeSchema
>;

export interface AccountView {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  customer: { id: string; name: string } | null;
  createdAt: string;
  lastLoginAt: string | null;
}
