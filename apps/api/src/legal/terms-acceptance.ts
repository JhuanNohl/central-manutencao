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
