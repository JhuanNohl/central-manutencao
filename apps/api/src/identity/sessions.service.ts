import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { generateToken, hashToken } from '../common/crypto/tokens.js';
import { currentRequestContext } from '../common/http/request-context.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
  sessions,
} from '../database/schema/index.js';
import {
  authenticatedAccountColumns,
  loadAuthenticatedAccount,
  toAuthenticatedAccount,
} from './account-loader.js';
import type { AuthContext, AuthenticatedAccount } from './auth-context.js';
import { HOUR_MS, MINUTE_MS } from '../common/time/durations.js';

/** Intervalo mínimo entre gravações de "última atividade" da mesma sessão. */
const TOUCH_INTERVAL_MS = MINUTE_MS;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

/** Resultado de login, cadastro ou aceite de convite. */
export interface SignedIn {
  session: IssuedSession;
  account: AuthenticatedAccount;
}

@Injectable()
export class SessionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Abre uma sessão para a conta e devolve os dados que o frontend recebe. */
  async signIn(db: Executor, accountId: string): Promise<SignedIn> {
    return {
      session: await this.create(db, accountId),
      account: await loadAuthenticatedAccount(db, accountId),
    };
  }

  /** Resolve o token do cookie; recusa sessão expirada, revogada ou de conta desativada. */
  async resolve(token: string): Promise<AuthContext | null> {
    const id = hashToken(token);
    const [row] = await this.db
      .select({
        ...authenticatedAccountColumns,
        lastSeenAt: sessions.lastSeenAt,
        absoluteExpiresAt: sessions.absoluteExpiresAt,
      })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .leftJoin(customerContacts, eq(customerContacts.accountId, accounts.id))
      .leftJoin(customers, eq(customers.id, customerContacts.customerId))
      .where(
        and(
          eq(sessions.id, id),
          isNull(sessions.revokedAt),
          gt(sessions.idleExpiresAt, sql`now()`),
          gt(sessions.absoluteExpiresAt, sql`now()`),
          eq(accounts.status, 'ativa'),
        ),
      );
    if (!row) return null;

    await this.touch(id, row.lastSeenAt, row.absoluteExpiresAt);
    return { sessionId: id, account: toAuthenticatedAccount(row) };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  /** Revoga todas as sessões da conta, opcionalmente preservando a atual. */
  async revokeAll(
    db: Executor,
    accountId: string,
    exceptSessionId?: string,
  ): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(sessions.accountId, accountId),
          isNull(sessions.revokedAt),
          exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined,
        ),
      );
  }

  /** Cria uma sessão nova (sempre um token novo: evita fixação de sessão). */
  private async create(
    db: Executor,
    accountId: string,
  ): Promise<IssuedSession> {
    const token = generateToken();
    const now = Date.now();
    const absoluteExpiresAt = new Date(
      now + this.env.SESSION_ABSOLUTE_HOURS * HOUR_MS,
    );
    const context = currentRequestContext();
    await db.insert(sessions).values({
      id: hashToken(token),
      accountId,
      idleExpiresAt: this.idleExpiry(now, absoluteExpiresAt),
      absoluteExpiresAt,
      ip: context?.ip ?? null,
      userAgent: context?.userAgent ?? null,
    });
    return { token, expiresAt: absoluteExpiresAt };
  }

  /** Renova a expiração por inatividade, no máximo uma gravação por minuto. */
  private async touch(
    sessionId: string,
    lastSeenAt: Date,
    absoluteExpiresAt: Date,
  ): Promise<void> {
    const now = Date.now();
    if (now - lastSeenAt.getTime() <= TOUCH_INTERVAL_MS) return;
    await this.db
      .update(sessions)
      .set({
        lastSeenAt: new Date(now),
        idleExpiresAt: this.idleExpiry(now, absoluteExpiresAt),
      })
      .where(eq(sessions.id, sessionId));
  }

  private idleExpiry(now: number, absoluteExpiresAt: Date): Date {
    const idle = now + this.env.SESSION_IDLE_MINUTES * MINUTE_MS;
    return new Date(Math.min(idle, absoluteExpiresAt.getTime()));
  }
}
