import type { InvitationStatus, InvitationView } from '@central/contracts';
import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { reference } from '../common/mapping.js';
import type { Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
  invitations,
} from '../database/schema/index.js';

/** Consultas e situação dos convites, compartilhadas pela emissão e pelo acesso ao portal. */

const inviter = alias(accounts, 'inviter');

export function statusOf(row: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InvitationStatus {
  if (row.acceptedAt) return 'aceito';
  if (row.revokedAt) return 'revogado';
  if (row.expiresAt.getTime() <= Date.now()) return 'expirado';
  return 'pendente';
}

export function statusFilter(status: InvitationStatus): SQL | undefined {
  switch (status) {
    case 'aceito':
      return isNotNull(invitations.acceptedAt);
    case 'revogado':
      return isNotNull(invitations.revokedAt);
    case 'expirado':
      return and(
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        lte(invitations.expiresAt, sql`now()`),
      );
    case 'pendente':
      return and(
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, sql`now()`),
      );
  }
}

export const openInvitation = and(
  isNull(invitations.acceptedAt),
  isNull(invitations.revokedAt),
);

/**
 * Revoga os convites em aberto para o e-mail: um convite novo ou um acesso
 * criado pela equipe substitui o anterior. Devolve os convites revogados.
 */
export async function revokeOpenInvitations(
  db: Executor,
  email: string,
): Promise<string[]> {
  const rows = await db
    .update(invitations)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.email, email), openInvitation))
    .returning({ id: invitations.id });
  return rows.map((row) => row.id);
}

export function selectInvitationViews(db: Executor) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      customerId: customers.id,
      customerName: customers.name,
      inviterId: inviter.id,
      inviterName: inviter.name,
    })
    .from(invitations)
    .leftJoin(
      customerContacts,
      eq(customerContacts.id, invitations.customerContactId),
    )
    .leftJoin(customers, eq(customers.id, customerContacts.customerId))
    .leftJoin(inviter, eq(inviter.id, invitations.invitedByAccountId))
    .$dynamic();
}

type InvitationRow = Awaited<ReturnType<typeof selectInvitationViews>>[number];

export function toInvitationView(row: InvitationRow): InvitationView {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: statusOf(row),
    customer: reference(row.customerId, row.customerName),
    invitedBy: reference(row.inviterId, row.inviterName),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}
