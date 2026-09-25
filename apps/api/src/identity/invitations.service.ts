import { Inject, Injectable } from '@nestjs/common';
import type {
  AcceptInvitationRequest,
  CreateStaffInvitationRequest,
  InvitationPreview,
  InvitationStatus,
  InvitationView,
  ListInvitationsQuery,
  Page,
} from '@central/contracts';
import {
  and,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../common/crypto/passwords.js';
import { generateToken, hashToken } from '../common/crypto/tokens.js';
import { ApiException } from '../common/http/api-exception.js';
import { formatInstant } from '../common/time/format.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
  invitations,
} from '../database/schema/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { loadAuthenticatedAccount } from './account-loader.js';
import type { AuthContext } from './auth-context.js';
import { AuthService, type SignedIn } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

export const INVITATION_TTL_MS = 7 * 24 * 3_600_000;

const inviter = alias(accounts, 'inviter');

function statusOf(row: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): InvitationStatus {
  if (row.acceptedAt) return 'aceito';
  if (row.revokedAt) return 'revogado';
  if (row.expiresAt.getTime() <= Date.now()) return 'expirado';
  return 'pendente';
}

function statusFilter(status: InvitationStatus): SQL | undefined {
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

const openInvitation = and(
  isNull(invitations.acceptedAt),
  isNull(invitations.revokedAt),
);

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createStaff(
    auth: AuthContext,
    input: CreateStaffInvitationRequest,
  ): Promise<InvitationView> {
    const id = await this.db.transaction(async (tx) => {
      await this.auth.assertEmailAvailable(tx, input.email);
      return this.issue(tx, auth, {
        email: input.email,
        role: input.role,
        customerContactId: null,
        customerName: null,
      });
    });
    return this.get(id);
  }

  /** Convida um contato já cadastrado de um cliente a acessar o portal. */
  async createForContact(
    auth: AuthContext,
    customerId: string,
    contactId: string,
  ): Promise<InvitationView> {
    const id = await this.db.transaction(async (tx) => {
      const [contact] = await tx
        .select({
          id: customerContacts.id,
          email: customerContacts.email,
          accountId: customerContacts.accountId,
          customerName: customers.name,
        })
        .from(customerContacts)
        .innerJoin(customers, eq(customers.id, customerContacts.customerId))
        .where(
          and(
            eq(customerContacts.id, contactId),
            eq(customerContacts.customerId, customerId),
          ),
        )
        .for('update', { of: customerContacts });
      if (!contact) throw ApiException.notFound('Contato não encontrado.');
      if (contact.accountId) {
        throw ApiException.conflict('Este contato já possui acesso ao portal.');
      }
      await this.auth.assertEmailAvailable(tx, contact.email);

      return this.issue(tx, auth, {
        email: contact.email,
        role: 'cliente',
        customerContactId: contact.id,
        customerName: contact.customerName,
      });
    });
    return this.get(id);
  }

  async list(query: ListInvitationsQuery): Promise<Page<InvitationView>> {
    const where = query.status ? statusFilter(query.status) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.selectViews()
        .where(where)
        .orderBy(desc(invitations.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(invitations).where(where),
    ]);
    return {
      items: rows.map((row) => this.toView(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async revoke(auth: AuthContext, id: string): Promise<InvitationView> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(invitations)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(invitations.id, id), openInvitation))
        .returning({ id: invitations.id });
      if (!row) {
        await this.get(id, tx); // 404 se não existir
        throw ApiException.conflict('O convite já foi aceito ou revogado.');
      }
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'convite.revogado',
        entityType: 'invitation',
        entityId: id,
      });
    });
    return this.get(id);
  }

  /** Dados exibidos na tela de aceite; não revela nada se o token for inválido. */
  async lookup(token: string): Promise<InvitationPreview> {
    const [row] = await this.db
      .select({
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        customerName: customers.name,
        suggestedName: customerContacts.name,
      })
      .from(invitations)
      .leftJoin(
        customerContacts,
        eq(customerContacts.id, invitations.customerContactId),
      )
      .leftJoin(customers, eq(customers.id, customerContacts.customerId))
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          openInvitation,
          gt(invitations.expiresAt, sql`now()`),
        ),
      );
    if (!row) throw ApiException.invalidToken();
    return { ...row, expiresAt: row.expiresAt.toISOString() };
  }

  /** Aceite de uso único: a marcação do convite e a criação da conta são atômicas. */
  async accept(input: AcceptInvitationRequest): Promise<SignedIn> {
    return this.db.transaction(async (tx) => {
      const [invitation] = await tx
        .update(invitations)
        .set({ acceptedAt: sql`now()` })
        .where(
          and(
            eq(invitations.tokenHash, hashToken(input.token)),
            openInvitation,
            gt(invitations.expiresAt, sql`now()`),
          ),
        )
        .returning();
      if (!invitation) throw ApiException.invalidToken();

      await this.auth.assertEmailAvailable(tx, invitation.email);
      const [account] = await tx
        .insert(accounts)
        .values({
          email: invitation.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
          role: invitation.role,
          // O convite chegou ao e-mail: posse do endereço comprovada.
          emailVerifiedAt: sql`now()`,
          lastLoginAt: sql`now()`,
        })
        .returning({ id: accounts.id });

      if (invitation.customerContactId) {
        const [linked] = await tx
          .update(customerContacts)
          .set({ accountId: account.id })
          .where(
            and(
              eq(customerContacts.id, invitation.customerContactId),
              isNull(customerContacts.accountId),
            ),
          )
          .returning({ id: customerContacts.id });
        if (!linked) {
          throw ApiException.conflict(
            'Este contato já possui acesso ao portal.',
          );
        }
      }

      await tx
        .update(invitations)
        .set({ acceptedAccountId: account.id })
        .where(eq(invitations.id, invitation.id));
      await this.audit.record(tx, {
        actorAccountId: account.id,
        action: 'convite.aceito',
        entityType: 'invitation',
        entityId: invitation.id,
        data: { accountId: account.id, role: invitation.role },
      });

      const session = await this.sessions.create(tx, account.id);
      return {
        session,
        account: await loadAuthenticatedAccount(tx, account.id),
      };
    });
  }

  private async issue(
    tx: Executor,
    auth: AuthContext,
    target: {
      email: string;
      role: typeof invitations.$inferInsert.role;
      customerContactId: string | null;
      customerName: string | null;
    },
  ): Promise<string> {
    // Um novo convite substitui o anterior ainda em aberto para o mesmo e-mail.
    const superseded = await tx
      .update(invitations)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(invitations.email, target.email), openInvitation))
      .returning({ id: invitations.id });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const [invitation] = await tx
      .insert(invitations)
      .values({
        tokenHash: hashToken(token),
        email: target.email,
        role: target.role,
        customerContactId: target.customerContactId,
        invitedByAccountId: auth.account.id,
        expiresAt,
      })
      .returning({ id: invitations.id });

    await this.notifications.enqueue(tx, {
      template: 'convite',
      recipient: target.email,
      origin: `invitation:${invitation.id}`,
      dedupeKey: `invitation:${invitation.id}`,
      payload: {
        link: `${this.env.APP_ORIGIN}/convite#token=${token}`,
        customerName: target.customerName,
        expiresAtLabel: formatInstant(expiresAt, this.env.OPERATIONAL_TIMEZONE),
      },
    });
    await this.audit.record(tx, {
      actorAccountId: auth.account.id,
      action: 'convite.criado',
      entityType: 'invitation',
      entityId: invitation.id,
      data: {
        email: target.email,
        role: target.role,
        customerContactId: target.customerContactId,
        supersededInvitationIds: superseded.map((row) => row.id),
      },
    });
    return invitation.id;
  }

  private selectViews(db: Executor = this.db) {
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

  private async get(id: string, db: Executor = this.db) {
    const [row] = await this.selectViews(db).where(eq(invitations.id, id));
    if (!row) throw ApiException.notFound('Convite não encontrado.');
    return this.toView(row);
  }

  private toView(
    row: Awaited<ReturnType<InvitationsService['selectViews']>>[number],
  ): InvitationView {
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: statusOf(row),
      customer:
        row.customerId && row.customerName
          ? { id: row.customerId, name: row.customerName }
          : null,
      invitedBy:
        row.inviterId && row.inviterName
          ? { id: row.inviterId, name: row.inviterName }
          : null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
    };
  }
}
