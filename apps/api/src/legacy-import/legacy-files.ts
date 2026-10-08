import { createHash } from 'node:crypto';
import type { FileContentType, FilePurpose } from '@central/contracts';
import type { Executor } from '../database/database.types.js';
import { files } from '../database/schema/index.js';
import { detectContentType, safeFileName } from '../files/file-content.js';
import type { FileStorage } from '../files/file-storage.js';
import { storageKeyFor } from '../files/files.service.js';
import type { LegacyFileContent, LegacySource } from './legacy-source.js';

/** Cópia de um arquivo do legado já gravada no armazenamento, pronta para o banco. */
export interface PreparedFile {
  storageKey: string;
  name: string;
  contentType: FileContentType;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
}

export type PreparedFileResult = PreparedFile | { problem: string };

/**
 * Arquivos de um ticket. Lê e grava o conteúdo antes da transação; se a
 * gravação no banco falhar, `discard` apaga as cópias, para o armazenamento
 * não guardar arquivo sem registro.
 */
export class LegacyFiles {
  private readonly written: string[] = [];
  private readonly contents = new Map<number, LegacyFileContent | null>();

  constructor(
    private readonly source: LegacySource,
    private readonly storage: FileStorage,
  ) {}

  /** Uma cópia por uso: aqui um arquivo pertence a um único registro. */
  async prepare(
    fileId: number,
    purpose: FilePurpose,
  ): Promise<PreparedFileResult> {
    const file = await this.read(fileId);
    if (!file) {
      return { problem: `arquivo ${fileId} sem conteúdo no banco do legado` };
    }
    if (file.content.length === 0) {
      return { problem: `arquivo ${fileId} vazio` };
    }
    const contentType = detectContentType(purpose, file.content);
    if (!contentType) {
      return {
        problem: `arquivo ${fileId} não é de um tipo aceito para ${purpose}`,
      };
    }
    const storageKey = storageKeyFor(new Date());
    await this.storage.put(storageKey, file.content);
    this.written.push(storageKey);
    return {
      storageKey,
      name: safeFileName(file.name),
      contentType,
      sizeBytes: file.content.length,
      sha256: createHash('sha256').update(file.content).digest('hex'),
      content: file.content,
    };
  }

  async discard(): Promise<void> {
    await Promise.all(this.written.map((key) => this.storage.remove(key)));
    this.written.length = 0;
  }

  private async read(fileId: number): Promise<LegacyFileContent | null> {
    if (!this.contents.has(fileId)) {
      this.contents.set(fileId, await this.source.fileContent(fileId));
    }
    return this.contents.get(fileId) ?? null;
  }
}

/** Registro do arquivo, já vinculado: a importação é o próprio vínculo. */
export async function insertImportedFile(
  db: Executor,
  file: PreparedFile,
  purpose: FilePurpose,
  ownerAccountId: string,
  createdAt: Date,
): Promise<string> {
  const [row] = await db
    .insert(files)
    .values({
      ownerAccountId,
      purpose,
      originalName: file.name,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      storageKey: file.storageKey,
      createdAt,
      linkedAt: createdAt,
    })
    .returning({ id: files.id });
  return row.id;
}
