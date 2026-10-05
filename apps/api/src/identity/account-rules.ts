import { eq } from 'drizzle-orm';
import { ApiException } from '../common/http/api-exception.js';
import type { Executor } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';

/**
 * Um e-mail identifica no máximo uma conta. Verificado antes de criar conta
 * ou convite; a unicidade no banco cobre a corrida entre duas requisições.
 */
export async function ensureEmailAvailable(
  db: Executor,
  email: string,
  /** Campo do formulário que recebe o erro. */
  path = 'email',
): Promise<void> {
  const [taken] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, email));
  if (taken) {
    throw ApiException.conflict('Este e-mail já possui conta.', [
      { path, message: 'E-mail já cadastrado' },
    ]);
  }
}
