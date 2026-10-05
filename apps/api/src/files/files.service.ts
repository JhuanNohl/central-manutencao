import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  TEMPORARY_FILES_QUOTA,
  type FilePurpose,
  type StoredFileView,
} from '@central/contracts';
import { and, count, eq, isNull, lt, sum } from 'drizzle-orm';
import type { Readable } from 'node:stream';
import { ApiException } from '../common/http/api-exception.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import { files } from '../database/schema/index.js';
import { checkFileContent, safeFileName } from './file-content.js';
import type { ByteRange } from './file-range.js';
import { FILE_STORAGE, type FileStorage } from './file-storage.js';
import { HOUR_MS } from '../common/time/durations.js';

export type FileRow = typeof files.$inferSelect;

export function toFileView(row: FileRow): StoredFileView {
  return {
    id: row.id,
    purpose: row.purpose,
    name: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
  };
}

/** Chave no armazenamento: agrupada por mês, sem nada informado pelo usuário. */
function storageKeyFor(now: Date): string {
  const month = now.toISOString().slice(0, 7).replace('-', '');
  return `${month}/${randomUUID()}`;
}

/**
 * Arquivos privados. Um envio cria um arquivo temporário do autor; o vínculo
 * a um atendimento acontece na transação da operação (`claimTemporaryFiles`).
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /**
   * `db` é a transação de quem chama, quando houver (envio pelo celular): uma
   * segunda conexão dentro da transação esgotaria o pool sob concorrência.
   */
  async upload(
    ownerAccountId: string,
    purpose: FilePurpose,
    originalName: string,
    content: Buffer,
    db: Executor = this.db,
  ): Promise<StoredFileView> {
    const name = safeFileName(originalName);
    const check = checkFileContent(purpose, name, content);
    if (!check.ok) {
      throw ApiException.validation([{ path: 'file', message: check.message }]);
    }
    await this.ensureTemporaryQuota(db, ownerAccountId, content.length);

    // O conteúdo é gravado antes do registro: um registro nunca aponta para
    // um arquivo inexistente. Se o banco falhar, o conteúdo é descartado.
    const storageKey = storageKeyFor(new Date());
    await this.storage.put(storageKey, content);
    try {
      const [row] = await db
        .insert(files)
        .values({
          ownerAccountId,
          purpose,
          originalName: name,
          contentType: check.contentType,
          sizeBytes: content.length,
          sha256: createHash('sha256').update(content).digest('hex'),
          storageKey,
        })
        .returning();
      return toFileView(row);
    } catch (error) {
      await this.discard(storageKey);
      throw error;
    }
  }

  /** Verificação prévia: um envio a mais na corrida não compromete o disco. */
  private async ensureTemporaryQuota(
    db: Executor,
    ownerAccountId: string,
    incomingBytes: number,
  ): Promise<void> {
    const [usage] = await db
      .select({ files: count(), bytes: sum(files.sizeBytes).mapWith(Number) })
      .from(files)
      .where(
        and(eq(files.ownerAccountId, ownerAccountId), isNull(files.linkedAt)),
      );
    if (
      usage.files >= TEMPORARY_FILES_QUOTA.files ||
      (usage.bytes ?? 0) + incomingBytes > TEMPORARY_FILES_QUOTA.bytes
    ) {
      throw ApiException.conflict(
        'Você atingiu o limite de arquivos enviados e ainda não usados em um atendimento. Conclua a abertura com os arquivos já enviados ou aguarde a limpeza automática.',
      );
    }
  }

  /**
   * Conteúdo de um arquivo temporário do próprio autor, na finalidade
   * esperada. Arquivo de outra conta responde como inexistente.
   */
  async readOwnTemporary(
    ownerAccountId: string,
    fileId: string,
    purpose: FilePurpose,
  ): Promise<{ file: FileRow; content: Buffer }> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.ownerAccountId, ownerAccountId),
          eq(files.purpose, purpose),
          isNull(files.linkedAt),
        ),
      );
    if (!file) {
      throw ApiException.notFound(
        'Arquivo não encontrado ou já usado. Envie o arquivo novamente.',
      );
    }
    return { file, content: await this.storage.read(file.storageKey) };
  }

  /**
   * Temporário do próprio autor, para a miniatura no computador do que
   * chegou pelo celular antes da abertura. Outra conta recebe 404.
   */
  async findOwnTemporary(
    ownerAccountId: string,
    fileId: string,
  ): Promise<FileRow> {
    const [file] = await this.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.ownerAccountId, ownerAccountId),
          isNull(files.linkedAt),
        ),
      );
    if (!file) throw ApiException.notFound('Arquivo não encontrado.');
    return file;
  }

  /** Conteúdo para download, sem carregar o arquivo inteiro na memória. */
  open(file: Pick<FileRow, 'storageKey'>, range: ByteRange | null): Readable {
    return this.storage.openRead(file.storageKey, range);
  }

  /**
   * Remove temporários abandonados. O registro sai primeiro (na mesma
   * instrução que confirma que continua sem vínculo); depois, o conteúdo.
   */
  async removeExpiredTemporary(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.env.FILES_TEMP_TTL_HOURS * HOUR_MS,
    );
    const removed = await this.db
      .delete(files)
      .where(and(isNull(files.linkedAt), lt(files.createdAt, cutoff)))
      .returning({ storageKey: files.storageKey });
    for (const { storageKey } of removed) await this.discard(storageKey);
    return removed.length;
  }

  /** Falha ao apagar deixa só conteúdo sem registro, inacessível pela API. */
  private async discard(storageKey: string): Promise<void> {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      this.logger.warn(
        `Conteúdo não removido (${storageKey}): ${String(error)}`,
      );
    }
  }
}
