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
import type { AuthContext } from './auth-context.js';

/** Intervalo mínimo entre gravações de "última atividade" da mesma sessão. */
const TOUCH_INTERVAL_MS = 60_000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class SessionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Cria uma sessão nova (sempre um token novo: evita fixação de sessão). */
  async create(db: Executor, accountId: string): Promise<IssuedSession> {
    const token = generateToken();
    const now = Date.now();
    const absoluteExpiresAt = new Date(
      now + this.env.SESSION_ABSOLUTE_HOURS * 3_600_000,
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

  /** Resolve o token do cookie; recusa sessão expirada, revogada ou de conta desativada. */
  async resolve(token: string): Promise<AuthContext | null> {
    const id = hashToken(token);
    const [row] = await this.db
      .select({
        session: {
          id: sessions.id,
          lastSeenAt: sessions.lastSeenAt,
          absoluteExpiresAt: sessions.absoluteExpiresAt,
        },
        account: {
          id: accounts.id,
          email: accounts.email,
          name: accounts.name,
          role: accounts.role,
          emailVerifiedAt: accounts.emailVerifiedAt,
        },
        customer: { id: customers.id, name: customers.name },
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

    const now = Date.now();
    if (now - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db
        .update(sessions)
        .set({
          lastSeenAt: new Date(now),
          idleExpiresAt: this.idleExpiry(now, row.session.absoluteExpiresAt),
        })
        .where(eq(sessions.id, id));
    }

    const { emailVerifiedAt, ...account } = row.account;
    return {
      sessionId: id,
      account: {
        ...account,
        emailVerified: emailVerifiedAt !== null,
        customer: row.customer,
      },
    };
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

  private idleExpiry(now: number, absoluteExpiresAt: Date): Date {
    const idle = now + this.env.SESSION_IDLE_MINUTES * 60_000;
    return new Date(Math.min(idle, absoluteExpiresAt.getTime()));
  }
}
