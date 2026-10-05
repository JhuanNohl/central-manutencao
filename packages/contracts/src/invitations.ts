import { z } from 'zod';
import { STAFF_ROLES, type Role } from './authorization.js';
import {
  emailSchema,
  opaqueTokenSchema,
  paginationQuerySchema,
  personNameSchema,
  uuidSchema,
} from './common.js';
import { passwordSchema } from './passwords.js';

/** Validade do convite, também informada na tela de aceite. */
export const INVITATION_TTL_DAYS = 7;

export const INVITATION_STATUSES = [
  'pendente',
  'aceito',
  'revogado',
  'expirado',
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** Convite de integrante da equipe (agente ou administrador). */
export const createStaffInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(STAFF_ROLES),
});
export type CreateStaffInvitationRequest = z.infer<
  typeof createStaffInvitationSchema
>;

export const listInvitationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INVITATION_STATUSES).optional(),
});
export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;

export const invitationLookupSchema = z.object({ token: opaqueTokenSchema });
export type InvitationLookupRequest = z.infer<typeof invitationLookupSchema>;

export const acceptInvitationSchema = z.object({
  token: opaqueTokenSchema,
  name: personNameSchema,
  password: passwordSchema,
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationSchema>;

export interface InvitationPreview {
  email: string;
  role: Role;
  customerName: string | null;
  /** Nome sugerido (contato de cliente já cadastrado). */
  suggestedName: string | null;
  expiresAt: string;
}

export interface InvitationView {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  customer: { id: string; name: string } | null;
  invitedBy: { id: string; name: string } | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}
