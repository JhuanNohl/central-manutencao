import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AccountTokensService } from './account-tokens.service.js';
import type { AuthContext } from './auth-context.js';

/** Confirmação de posse do e-mail informado no autocadastro. */
@Injectable()
export class EmailVerificationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly tokens: AccountTokensService,
    private readonly links: EmailLinks,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Emite o link de confirmação na transação da operação de origem. */
  async send(
    db: Executor,
    account: { id: string; email: string; name: string },
  ): Promise<void> {
    const { token } = await this.tokens.issue(
      db,
      account.id,
      'confirmacao_email',
    );
    await this.notifications.enqueue(db, {
      template: 'confirmacao_email',
      recipient: account.email,
      origin: `account:${account.id}`,
      payload: {
        name: account.name,
        link: this.links.withToken('confirmar-email', token),
      },
    });
  }

  async resend(auth: AuthContext): Promise<void> {
    if (auth.account.emailVerified) return;
    await this.db.transaction((tx) => this.send(tx, auth.account));
  }

  async confirm(token: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const accountId = await this.tokens.consume(
        tx,
        token,
        'confirmacao_email',
      );
      if (!accountId) throw ApiException.invalidToken();

      await tx
        .update(accounts)
        .set({
          emailVerifiedAt: sql`coalesce(${accounts.emailVerifiedAt}, now())`,
        })
        .where(eq(accounts.id, accountId));
      await this.audit.record(tx, {
        actorAccountId: accountId,
        action: 'conta.email_confirmado',
        entityType: 'account',
        entityId: accountId,
      });
    });
  }
}
