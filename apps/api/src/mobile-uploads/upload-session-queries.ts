import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../database/database.types.js';
import {
  files,
  rmaItems,
  rmas,
  uploadSessionFiles,
  uploadSessions,
} from '../database/schema/index.js';
import type { FileRow } from '../files/files.service.js';

export type SessionRow = typeof uploadSessions.$inferSelect;

/** Arquivos recebidos na sessão, na ordem de chegada. */
export async function sessionFiles(
  db: Executor,
  sessionId: string,
): Promise<FileRow[]> {
  const rows = await db
    .select({ file: files })
    .from(uploadSessionFiles)
    .innerJoin(files, eq(files.id, uploadSessionFiles.fileId))
    .where(eq(uploadSessionFiles.sessionId, sessionId))
    .orderBy(asc(uploadSessionFiles.createdAt));
  return rows.map((row) => row.file);
}

/** Número público do chamado do item, para o título e o vínculo do vídeo. */
export async function rmaNumberOf(
  db: Executor,
  itemId: string,
): Promise<number | null> {
  const [rma] = await db
    .select({ number: rmas.number })
    .from(rmaItems)
    .innerJoin(rmas, eq(rmas.id, rmaItems.rmaId))
    .where(eq(rmaItems.id, itemId));
  return rma?.number ?? null;
}
