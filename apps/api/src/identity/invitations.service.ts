import { Inject, Injectable } from '@nestjs/common';
import {
  ROLE_LABELS,
  type AcceptInvitationRequest,
  type CreateStaffInvitationRequest,
  type InvitationPreview,
  type InvitationView,
  type ListInvitationsQuery,
  type Page,
  INVITATION_TTL_DAYS,
} from '@central/contracts';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {} from 'drizzle-orm/pg-core';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../common/crypto/passwords.js';
import { generateToken, hashToken } from '../common/crypto/tokens.js';
import { ApiException } from '../common/http/api-exception.js';
import { pageWindow, toPage } from '../common/db/pagination.js';
import {} from '../common/mapping.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
  invitations,
} from '../database/schema/index.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ensureEmailAvailable } from './account-rules.js';
import {
  openInvitation,
  revokeOpenInvitations,
  selectInvitationViews,
  statusFilter,
  toInvitationView,
} from './invitation-queries.js';
import type { AuthContext } from './auth-context.js';
import { SessionsService, type SignedIn } from './sessions.service.js';
import { DAY_MS } from '../common/time/durations.js';

export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * DAY_MS;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsService,
    private readonly links: EmailLinks,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createStaff(
    auth: AuthContext,
    input: CreateStaffInvitationRequest,
  ): Promise<InvitationView> {
    const id = await this.db.transaction(async (tx) => {
      await ensureEmailAvailable(tx, input.email);
      return this.issue(tx, auth, input);
    });
    return this.get(id);
  }

  async list(query: ListInvitationsQuery): Promise<Page<InvitationView>> {
    const where = query.status ? statusFilter(query.status) : undefined;
    const { limit, offset } = pageWindow(query);
    return toPage(
      query,
      selectInvitationViews(this.db)
        .where(where)
        .orderBy(desc(invitations.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(invitations).where(where),
      toInvitationView,
    );
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
    const passwordHash = await hashPassword(input.password);

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

      await ensureEmailAvailable(tx, invitation.email);
      const [account] = await tx
        .insert(accounts)
        .values({
          email: invitation.email,
          name: input.name,
          passwordHash,
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
      await this.notifications.enqueue(tx, {
        template: 'acesso_liberado',
        recipient: invitation.email,
        origin: `account:${account.id}`,
        dedupeKey: `acesso_liberado:${account.id}`,
        payload: {
          name: input.name,
          email: invitation.email,
          roleLabel: ROLE_LABELS[invitation.role],
          link: this.links.login(),
        },
      });

      return this.sessions.signIn(tx, account.id);
    });
  }

  private async issue(
    tx: Executor,
    auth: AuthContext,
    target: CreateStaffInvitationRequest,
  ): Promise<string> {
    // Um novo convite substitui o anterior ainda em aberto para o mesmo e-mail.
    const superseded = await revokeOpenInvitations(tx, target.email);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const [invitation] = await tx
      .insert(invitations)
      .values({
        tokenHash: hashToken(token),
        email: target.email,
        role: target.role,
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
        link: this.links.withToken('convite', token),
        roleLabel: ROLE_LABELS[target.role],
        invitedByName: auth.account.name,
        expiresAtLabel: this.links.expiry(expiresAt),
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
        supersededInvitationIds: superseded,
      },
    });
    return invitation.id;
  }

  private async get(id: string, db: Executor = this.db) {
    const [row] = await selectInvitationViews(db).where(eq(invitations.id, id));
    if (!row) throw ApiException.notFound('Convite não encontrado.');
    return toInvitationView(row);
  }
}
