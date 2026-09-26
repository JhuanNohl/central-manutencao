import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { LoginRequest, RegisterRequest } from '@central/contracts';
import { eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import {
  hashPassword,
  simulatePasswordCheck,
  verifyPassword,
} from '../common/crypto/passwords.js';
import { ApiException } from '../common/http/api-exception.js';
import {
  insertContact,
  insertCustomer,
  isDocumentRegistered,
} from '../customers/customer-records.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';
import { ensureEmailAvailable } from './account-rules.js';
import type { AuthContext } from './auth-context.js';
import { EmailVerificationService } from './email-verification.service.js';
import { SessionsService, type SignedIn } from './sessions.service.js';

/** Entrada e saída da sessão, e autocadastro de cliente. */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsService,
    private readonly emailVerification: EmailVerificationService,
    private readonly audit: AuditService,
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
      throw invalidCredentials();
    }
    if (!(await verifyPassword(account.passwordHash, input.password))) {
      throw invalidCredentials();
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
      return this.sessions.signIn(tx, account.id);
    });
  }

  /** Autocadastro: cliente, contato e conta nascem juntos ou não nascem. */
  async register(input: RegisterRequest): Promise<SignedIn> {
    return this.db.transaction(async (tx) => {
      if (await isDocumentRegistered(tx, input.customer.document)) {
        // Não vincular a um cliente existente: daria acesso a atendimentos de terceiros.
        throw ApiException.conflict(
          'Este CPF/CNPJ já possui cadastro. Solicite à equipe de manutenção um convite de acesso.',
          [{ path: 'customer.document', message: 'Documento já cadastrado' }],
        );
      }
      await ensureEmailAvailable(tx, input.email);

      const [account] = await tx
        .insert(accounts)
        .values({
          email: input.email,
          name: input.contact.name,
          passwordHash: await hashPassword(input.password),
          role: 'cliente',
        })
        .returning({ id: accounts.id });
      const customerId = await insertCustomer(tx, input.customer, account.id);
      await insertContact(
        tx,
        customerId,
        { ...input.contact, email: input.email },
        account.id,
      );

      await this.audit.record(tx, {
        actorAccountId: account.id,
        action: 'conta.autocadastro',
        entityType: 'account',
        entityId: account.id,
        data: { customerId, kind: input.customer.kind },
      });
      await this.emailVerification.send(tx, {
        id: account.id,
        email: input.email,
        name: input.contact.name,
      });

      return this.sessions.signIn(tx, account.id);
    });
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
  }
}

function invalidCredentials(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'E-mail ou senha inválidos.',
  );
}
