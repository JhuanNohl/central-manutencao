import { and, eq } from 'drizzle-orm';
import { ApiException } from '../common/http/api-exception.js';
import type { Executor } from '../database/database.types.js';
import { rmas } from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';

export type RmaRow = typeof rmas.$inferSelect;

/** Cliente da conta do portal; a equipe não tem cadastro próprio. */
export function ownCustomerId(auth: AuthContext): string {
  const customer = auth.account.customer;
  if (!customer) throw ApiException.forbidden();
  return customer.id;
}

/**
 * RMA do próprio cliente. O de outro cliente responde como inexistente,
 * sem revelar que existe (CA04).
 */
export async function findOwnRma(
  db: Executor,
  auth: AuthContext,
  number: number,
): Promise<RmaRow> {
  const [row] = await db
    .select()
    .from(rmas)
    .where(
      and(eq(rmas.number, number), eq(rmas.customerId, ownCustomerId(auth))),
    );
  if (!row) throw ApiException.notFound('Atendimento não encontrado.');
  return row;
}

/**
 * Bloqueia o RMA até o fim da transação. Toda operação que muda o chamado ou
 * os itens passa por aqui, então cancelamento, recebimento e mudança de
 * etapa não se cruzam. Chamado encerrado (cancelado ou entregue) não muda mais.
 */
export async function lockOpenRma(
  db: Executor,
  rmaId: string,
): Promise<RmaRow> {
  const [row] = await db
    .select()
    .from(rmas)
    .where(eq(rmas.id, rmaId))
    .for('update');
  if (!row) throw ApiException.notFound('Chamado não encontrado.');
  if (row.cancelledAt) {
    throw ApiException.conflict('Este chamado foi cancelado.');
  }
  if (row.closedAt) {
    throw ApiException.conflict('Este chamado já foi encerrado.');
  }
  return row;
}

/** RMA pelo número público, para a equipe. */
export async function findRma(db: Executor, number: number): Promise<RmaRow> {
  const [row] = await db.select().from(rmas).where(eq(rmas.number, number));
  if (!row) throw ApiException.notFound('Chamado não encontrado.');
  return row;
}
