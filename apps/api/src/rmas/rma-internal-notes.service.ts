import { Inject, Injectable } from '@nestjs/common';
import type {
  AddRmaInternalNoteRequest,
  RmaInternalNoteView,
} from '@central/contracts';
import { asc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import { rmaInternalNotes } from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { findRma } from './rma-scope.js';

type NoteRow = typeof rmaInternalNotes.$inferSelect;

/** Grava a nota na transação de quem chama (nota manual ou de uma operação). */
export async function insertRmaInternalNote(
  db: Executor,
  rmaId: string,
  author: { id: string; name: string },
  body: string,
): Promise<NoteRow> {
  const [row] = await db
    .insert(rmaInternalNotes)
    .values({
      rmaId,
      authorAccountId: author.id,
      authorName: author.name,
      body,
    })
    .returning();
  return row;
}

function toView(row: NoteRow): RmaInternalNoteView {
  return {
    id: row.id,
    body: row.body,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Anotações internas do chamado, só da equipe (RN11). Ficam fora da conversa
 * com o cliente e não mexem na data de atualização que o portal mostra.
 * Valem também depois do encerramento.
 */
@Injectable()
export class RmaInternalNotesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(number: number): Promise<RmaInternalNoteView[]> {
    const rma = await findRma(this.db, number);
    const rows = await this.db
      .select()
      .from(rmaInternalNotes)
      .where(eq(rmaInternalNotes.rmaId, rma.id))
      .orderBy(asc(rmaInternalNotes.createdAt));
    return rows.map(toView);
  }

  async add(
    auth: AuthContext,
    number: number,
    request: AddRmaInternalNoteRequest,
  ): Promise<RmaInternalNoteView> {
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      const row = await insertRmaInternalNote(
        tx,
        rma.id,
        auth.account,
        request.body,
      );
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.nota_interna_adicionada',
        entityType: 'rma',
        entityId: rma.id,
        data: { noteId: row.id },
      });
      return toView(row);
    });
  }
}
