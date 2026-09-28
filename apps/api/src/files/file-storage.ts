import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/**
 * Armazenamento do conteúdo dos arquivos (P03). O banco guarda só a chave;
 * a implementação pode ser trocada (ex.: compatível com S3) sem mudar as regras.
 */
export interface FileStorage {
  /** Grava o conteúdo; falha se a chave já existir. */
  put(key: string, content: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  /** Remoção idempotente: chave inexistente não é erro. */
  remove(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

/** Chaves geradas pela aplicação: segmentos hexadecimais, sem `..` nem barras soltas. */
const STORAGE_KEY = /^[0-9a-f]+(\/[0-9a-f-]+)+$/;

/** Disco local, sob `FILES_STORAGE_DIR`. A pasta precisa entrar no backup. */
@Injectable()
export class LocalDiskFileStorage implements FileStorage {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.FILES_STORAGE_DIR);
  }

  async put(key: string, content: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' });
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!STORAGE_KEY.test(key)) {
      throw new Error(`Chave de armazenamento inválida: ${key}`);
    }
    return join(this.root, ...key.split('/'));
  }
}
