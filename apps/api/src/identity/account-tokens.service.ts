import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { generateToken, hashToken } from '../common/crypto/tokens.js';
import type { Executor } from '../database/database.types.js';
import {
  accountTokens,
  type AccountTokenPurpose,
} from '../database/schema/index.js';
import { DAY_MS, HOUR_MS } from '../common/time/durations.js';
import { PASSWORD_RESET_TTL_HOURS } from '@central/contracts';

export const TOKEN_TTL_MS: Record<AccountTokenPurpose, number> = {
  redefinicao_senha: PASSWORD_RESET_TTL_HOURS * HOUR_MS,
  confirmacao_email: 3 * DAY_MS,
};

@Injectable()
export class AccountTokensService {
  /** Emite um token novo e invalida os anteriores ainda não usados da mesma finalidade. */
  async issue(
    db: Executor,
    accountId: string,
    purpose: AccountTokenPurpose,
  ): Promise<{ token: string; expiresAt: Date }> {
    await db
      .delete(accountTokens)
      .where(
        and(
          eq(accountTokens.accountId, accountId),
          eq(accountTokens.purpose, purpose),
          isNull(accountTokens.usedAt),
        ),
      );
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[purpose]);
    await db.insert(accountTokens).values({
      tokenHash: hashToken(token),
      accountId,
      purpose,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /** Há token ainda não usado emitido há menos de `withinMs`? */
  async issuedWithin(
    db: Executor,
    accountId: string,
    purpose: AccountTokenPurpose,
    withinMs: number,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: accountTokens.id })
      .from(accountTokens)
      .where(
        and(
          eq(accountTokens.accountId, accountId),
          eq(accountTokens.purpose, purpose),
          isNull(accountTokens.usedAt),
          gt(
            accountTokens.createdAt,
            sql`now() - make_interval(secs => ${withinMs / 1000})`,
          ),
        ),
      );
    return row !== undefined;
  }

  /**
   * Consome o token de forma atômica: só uma requisição concorrente vence.
   * Devolve a conta dona do token, ou `null` se inválido, expirado ou já usado.
   */
  async consume(
    db: Executor,
    token: string,
    purpose: AccountTokenPurpose,
  ): Promise<string | null> {
    const [row] = await db
      .update(accountTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(accountTokens.tokenHash, hashToken(token)),
          eq(accountTokens.purpose, purpose),
          isNull(accountTokens.usedAt),
          gt(accountTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ accountId: accountTokens.accountId });
    return row?.accountId ?? null;
  }
}
