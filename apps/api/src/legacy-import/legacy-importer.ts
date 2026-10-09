import { sql } from 'drizzle-orm';
import type { Database, Executor } from '../database/database.types.js';
import { auditEvents, rmas } from '../database/schema/index.js';
import { FIRST_PUBLIC_NUMBER } from '../database/schema/rmas.js';
import type { FileStorage } from '../files/file-storage.js';
import { importUsers } from './customer-import.js';
import type { ImportContext, ImportOptions } from './import-context.js';
import { ImportReport } from './import-report.js';
import type { LegacySource } from './legacy-source.js';
import { importStaff } from './staff-import.js';
import { importTickets } from './ticket-import.js';

/** Interrompe o ensaio no fim, para a transação desfazer tudo. */
class DryRunFinished extends Error {}

async function runImport(ctx: ImportContext): Promise<void> {
  const staff = await importStaff(ctx);
  const users = await importUsers(ctx);
  await importTickets(ctx, users, staff);
  // A execução fica no histórico, com as contagens e as ocorrências (sem
  // dados pessoais), para conferência depois da troca do sistema.
  await ctx.db.insert(auditEvents).values({
    action: 'legado.importacao',
    entityType: 'sistema',
    entityId: 'migracao-legado',
    data: ctx.report.toJSON(),
  });
}

/**
 * Importa o sistema anterior na ordem do guia (docs/5-homologacao-e-migracao/5.2-migracao-do-sistema-anterior.md):
 * equipe, clientes e chamados. Rodar de novo só acrescenta o que faltou.
 *
 * No ensaio (`dryRun`), tudo roda numa transação que é desfeita no fim: as
 * regras e restrições do banco são conferidas de verdade, sem gravar nada.
 * O armazenamento recebido deve ser descartável nesse caso.
 */
export async function importLegacy(
  db: Database,
  source: LegacySource,
  storage: FileStorage,
  options: ImportOptions,
): Promise<ImportReport> {
  const report = new ImportReport(options.dryRun);
  const contextOn = (executor: Executor): ImportContext => ({
    db: executor,
    source,
    storage,
    options,
    report,
  });
  if (!options.dryRun) {
    await runImport(contextOn(db));
    return report;
  }
  try {
    await db.transaction(async (tx) => {
      // O ensaio lê o legado com a transação aberta: sem o limite de ociosidade.
      await tx.execute(sql`set local idle_in_transaction_session_timeout = 0`);
      await runImport(contextOn(tx));
      throw new DryRunFinished();
    });
  } catch (error) {
    if (!(error instanceof DryRunFinished)) throw error;
  }
  await restartRmaNumbersIfEmpty(db);
  return report;
}

/**
 * Os números consumidos pelo ensaio não voltam com o rollback (sequências do
 * PostgreSQL). Sem nenhum chamado gravado, a numeração recomeça do #100001,
 * para a importação real usar os primeiros números.
 */
async function restartRmaNumbersIfEmpty(db: Database): Promise<void> {
  const [anyRma] = await db.select({ id: rmas.id }).from(rmas).limit(1);
  if (anyRma) return;
  await db.execute(
    sql`alter table rmas alter column number restart with ${sql.raw(String(FIRST_PUBLIC_NUMBER))}`,
  );
}
