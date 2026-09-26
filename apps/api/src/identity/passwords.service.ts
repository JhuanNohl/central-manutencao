import { Inject, Injectable } from '@nestjs/common';
import type {
  ChangePasswordRequest,
  PasswordResetConfirm,
} from '@central/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, verifyPassword } from '../common/crypto/passwords.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AccountTokensService } from './account-tokens.service.js';
import type { AuthContext } from './auth-context.js';
import { SessionsService } from './sessions.service.js';

/**
 * Redefinição (por link enviado ao e-mail) e troca de senha. As duas
 * encerram as sessões que não comprovaram a senha nova.
 */
@Injectable()
export class PasswordsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsService,
    private readonly tokens: AccountTokensService,
    private readonly links: EmailLinks,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
  async requestReset(email: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(and(eq(accounts.email, email), eq(accounts.status, 'ativa')));
      if (!account) return;

      const { token, expiresAt } = await this.tokens.issue(
        tx,
        account.id,
        'redefinicao_senha',
      );
      await this.notifications.enqueue(tx, {
        template: 'redefinicao_senha',
        recipient: email,
        origin: `account:${account.id}`,
        payload: {
          name: account.name,
          link: this.links.withToken('redefinir-senha', token),
          expiresAtLabel: this.links.expiry(expiresAt),
        },
      });
    });
  }

  async confirmReset(input: PasswordResetConfirm): Promise<void> {
    const passwordHash = await hashPassword(input.password);
    await this.db.transaction(async (tx) => {
      const accountId = await this.tokens.consume(
        tx,
        input.token,
        'redefinicao_senha',
      );
      if (!accountId) throw ApiException.invalidToken();

      const [account] = await tx
        .update(accounts)
        .set({
          passwordHash,
          // O link chegou ao e-mail: a posse do endereço está comprovada.
          emailVerifiedAt: sql`coalesce(${accounts.emailVerifiedAt}, now())`,
        })
        .where(and(eq(accounts.id, accountId), eq(accounts.status, 'ativa')))
        .returning({ id: accounts.id });
      if (!account) throw ApiException.invalidToken();

      await this.sessions.revokeAll(tx, accountId);
      await this.audit.record(tx, {
        actorAccountId: accountId,
        action: 'conta.senha_redefinida',
        entityType: 'account',
        entityId: accountId,
      });
    });
  }

  /** Troca a senha e encerra as demais sessões da conta. */
  async change(auth: AuthContext, input: ChangePasswordRequest): Promise<void> {
    await this.assertCurrentPassword(auth.account.id, input.currentPassword);
    const passwordHash = await hashPassword(input.newPassword);

    await this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ passwordHash })
        .where(eq(accounts.id, auth.account.id));
      await this.sessions.revokeAll(tx, auth.account.id, auth.sessionId);
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'conta.senha_alterada',
        entityType: 'account',
        entityId: auth.account.id,
      });
    });
  }

  private async assertCurrentPassword(
    accountId: string,
    password: string,
  ): Promise<void> {
    const [account] = await this.db
      .select({ passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!account || !(await verifyPassword(account.passwordHash, password))) {
      throw ApiException.validation(
        [{ path: 'currentPassword', message: 'Senha atual incorreta' }],
        'Senha atual incorreta.',
      );
    }
  }
}
