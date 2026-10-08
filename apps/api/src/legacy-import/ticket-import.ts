import type { ImportedUsers } from './customer-import.js';
import type { ImportContext } from './import-context.js';
import type { ImportSubject } from './import-report.js';
import { LegacyFiles } from './legacy-files.js';
import { importedEntityOf, LEGACY_SOURCES } from './legacy-records.js';
import type { StaffAccounts } from './staff-import.js';
import { planTicket } from './ticket-plan.js';
import { writeTicket } from './ticket-writer.js';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Tickets → chamados. Cada ticket grava inteiro ou não grava (chamado,
 * equipamentos, fotos, documentos, conversa e histórico): o que falhar fica
 * no relatório e entra numa próxima execução, sem duplicar os já importados.
 */
export async function importTickets(
  ctx: ImportContext,
  users: ImportedUsers,
  staff: StaffAccounts,
): Promise<void> {
  const tickets = (await ctx.source.tickets()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  for (const ticket of tickets) {
    const source = `ticket ${ticket.number}`;
    if (await importedEntityOf(ctx.db, LEGACY_SOURCES.ticket, ticket.id)) {
      ctx.report.countExisting('chamados');
      continue;
    }
    const requester = users.get(ticket.userId);
    if (!requester) {
      ctx.report.skip(
        source,
        `o cliente (ost_user ${ticket.userId}) ficou fora da migração`,
      );
      continue;
    }
    const files = new LegacyFiles(ctx.source, ctx.storage);
    try {
      const plan = await planTicket(
        { ctx, files, users, staff },
        ticket,
        requester,
      );
      const counts = await ctx.db.transaction((tx) =>
        writeTicket(tx, plan, staff, ctx.options.slaHours),
      );
      for (const [subject, amount] of Object.entries(counts)) {
        ctx.report.count(subject as ImportSubject, amount);
      }
    } catch (error) {
      await files.discard();
      ctx.report.fail(source, errorMessage(error));
    }
  }
}
