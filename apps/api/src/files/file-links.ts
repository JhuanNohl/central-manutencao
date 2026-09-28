import type { FilePurpose } from '@central/contracts';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import { files } from '../database/schema/index.js';

/**
 * Vincula arquivos temporários do autor, na finalidade indicada, dentro da
 * transação da operação. A condição `linked_at is null` torna o vínculo de
 * uso único mesmo sob concorrência; arquivo de outra conta, de outra
 * finalidade, já usado ou expirado não é devolvido.
 *
 * @returns os ids efetivamente vinculados; o chamador decide o erro dos demais.
 */
export async function claimTemporaryFiles(
  db: Executor,
  ownerAccountId: string,
  purpose: FilePurpose,
  fileIds: string[],
): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const claimed = await db
    .update(files)
    .set({ linkedAt: sql`now()` })
    .where(
      and(
        inArray(files.id, fileIds),
        eq(files.ownerAccountId, ownerAccountId),
        eq(files.purpose, purpose),
        isNull(files.linkedAt),
      ),
    )
    .returning({ id: files.id });
  return new Set(claimed.map((row) => row.id));
}
