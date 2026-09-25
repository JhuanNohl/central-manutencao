import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  ChangePasswordRequest,
  LoginRequest,
  PasswordResetConfirm,
  RegisterRequest,
} from '@central/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import {
  hashPassword,
  simulatePasswordCheck,
  verifyPassword,
} from '../common/crypto/passwords.js';
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
} from '../database/schema/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { loadAuthenticatedAccount } from './account-loader.js';
import { AccountTokensService } from './account-tokens.service.js';
import type { AuthContext, AuthenticatedAccount } from './auth-context.js';
import { SessionsService, type IssuedSession } from './sessions.service.js';

export interface SignedIn {
  session: IssuedSession;
  account: AuthenticatedAccount;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly sessions: SessionsService,
    private readonly tokens: AccountTokensService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async login(input: LoginRequest): Promise<SignedIn> {
    const [account] = await this.db
      .select({
        id: accounts.id,
        passwordHash: accounts.passwordHash,
        status: accounts.status,
      })
      .from(accounts)
      .where(eq(accounts.email, input.email));

    if (!account) {
      await simulatePasswordCheck(input.password);
      throw this.invalidCredentials();
    }
    if (!(await verifyPassword(account.passwordHash, input.password))) {
      throw this.invalidCredentials();
    }
    // Só revelado a quem conhece a senha.
    if (account.status !== 'ativa') {
      throw ApiException.forbidden(
        'Esta conta está desativada. Procure a equipe de manutenção.',
      );
    }

    return this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ lastLoginAt: sql`now()` })
        .where(eq(accounts.id, account.id));
      const session = await this.sessions.create(tx, account.id);
      return {
        session,
        account: await loadAuthenticatedAccount(tx, account.id),
      };
    });
  }

  /** Autocadastro: cliente, contato e conta nascem juntos ou não nascem. */
  async register(input: RegisterRequest): Promise<SignedIn> {
    return this.db.transaction(async (tx) => {
      const [existingDocument] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.document, input.customer.document));
      if (existingDocument) {
        // Não vincular a um cliente existente: daria acesso a atendimentos de terceiros.
        throw ApiException.conflict(
          'Este CPF/CNPJ já possui cadastro. Solicite à equipe de manutenção um convite de acesso.',
          [{ path: 'customer.document', message: 'Documento já cadastrado' }],
        );
      }
      await this.assertEmailAvailable(tx, input.email);

      const [account] = await tx
        .insert(accounts)
        .values({
          email: input.email,
          name: input.contact.name,
          passwordHash: await hashPassword(input.password),
          role: 'cliente',
        })
        .returning({ id: accounts.id });
      const [customer] = await tx
        .insert(customers)
        .values({
          kind: input.customer.kind,
          name: input.customer.name,
          tradeName: input.customer.tradeName || null,
          document: input.customer.document,
          createdByAccountId: account.id,
        })
        .returning({ id: customers.id });
      await tx.insert(customerContacts).values({
        customerId: customer.id,
        name: input.contact.name,
        email: input.email,
        phone: input.contact.phone || null,
        accountId: account.id,
      });

      await this.audit.record(tx, {
        actorAccountId: account.id,
        action: 'conta.autocadastro',
        entityType: 'account',
        entityId: account.id,
        data: { customerId: customer.id, kind: input.customer.kind },
      });
      await this.enqueueEmailVerification(
        tx,
        account.id,
        input.email,
        input.contact.name,
      );

      const session = await this.sessions.create(tx, account.id);
      return {
        session,
        account: await loadAuthenticatedAccount(tx, account.id),
      };
    });
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
  }

  /** Sempre responde igual, exista ou não a conta (não revela e-mails cadastrados). */
  async requestPasswordReset(email: string): Promise<void> {
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
          link: `${this.env.APP_ORIGIN}/redefinir-senha#token=${token}`,
          expiresAtLabel: formatInstant(
            expiresAt,
            this.env.OPERATIONAL_TIMEZONE,
          ),
        },
      });
    });
  }

  async confirmPasswordReset(input: PasswordResetConfirm): Promise<void> {
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
          passwordHash: await hashPassword(input.password),
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

  async confirmEmail(token: string): Promise<void> {
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

  async resendEmailVerification(auth: AuthContext): Promise<void> {
    if (auth.account.emailVerified) return;
    await this.db.transaction((tx) =>
      this.enqueueEmailVerification(
        tx,
        auth.account.id,
        auth.account.email,
        auth.account.name,
      ),
    );
  }

  /** Troca a senha e encerra as demais sessões da conta. */
  async changePassword(
    auth: AuthContext,
    input: ChangePasswordRequest,
  ): Promise<void> {
    const [account] = await this.db
      .select({ passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.id, auth.account.id));
    if (
      !account ||
      !(await verifyPassword(account.passwordHash, input.currentPassword))
    ) {
      throw ApiException.validation(
        [{ path: 'currentPassword', message: 'Senha atual incorreta' }],
        'Senha atual incorreta.',
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ passwordHash: await hashPassword(input.newPassword) })
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

  async assertEmailAvailable(db: Executor, email: string): Promise<void> {
    const [taken] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, email));
    if (taken) {
      throw ApiException.conflict('Este e-mail já possui conta.', [
        { path: 'email', message: 'E-mail já cadastrado' },
      ]);
    }
  }

  private async enqueueEmailVerification(
    db: Executor,
    accountId: string,
    email: string,
    name: string,
  ): Promise<void> {
    const { token } = await this.tokens.issue(
      db,
      accountId,
      'confirmacao_email',
    );
    await this.notifications.enqueue(db, {
      template: 'confirmacao_email',
      recipient: email,
      origin: `account:${accountId}`,
      payload: {
        name,
        link: `${this.env.APP_ORIGIN}/confirmar-email#token=${token}`,
      },
    });
  }

  private invalidCredentials(): ApiException {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'INVALID_CREDENTIALS',
      'E-mail ou senha inválidos.',
    );
  }
}
