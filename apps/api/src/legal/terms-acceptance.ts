import { eq } from 'drizzle-orm';
import type { Transaction } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';

/** Aceite do termo que vale na abertura; `renewed` quando aceito agora. */
export interface TermsAcceptance {
  version: string;
  renewed: boolean;
}

/**
 * Momento do aceite gravado no RMA: o desta abertura, que passa a valer
 * para a conta, ou o aceite que a conta já deu para a versão vigente.
 */
export async function recordTermsAcceptance(
  tx: Transaction,
  accountId: string,
  terms: TermsAcceptance,
  openedAt: Date,
): Promise<Date> {
  if (terms.renewed) {
    await tx
      .update(accounts)
      .set({ termsVersion: terms.version, termsAcceptedAt: openedAt })
      .where(eq(accounts.id, accountId));
    return openedAt;
  }
  const [account] = await tx
    .select({ acceptedAt: accounts.termsAcceptedAt })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return account.acceptedAt ?? openedAt;
}

/**
 * Aceite das contas que não passam pelo autocadastro: o cliente cadastrado
 * pela equipe e o importado do sistema anterior contam com o termo vigente
 * aceito (decisão de 08/10/2026). O termo só é pedido no autocadastro e,
 * depois, quando sai uma versão nova.
 */
export function termsAcceptedOnCreation(
  version: string,
  at: Date,
): { termsVersion: string; termsAcceptedAt: Date } {
  return { termsVersion: version, termsAcceptedAt: at };
}
