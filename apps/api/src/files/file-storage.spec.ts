import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import type { Env } from '../config/env.js';
import { LocalDiskFileStorage } from './file-storage.js';

describe('LocalDiskFileStorage', () => {
  let root: string;
  let storage: LocalDiskFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'central-arquivos-'));
    storage = new LocalDiskFileStorage({ FILES_STORAGE_DIR: root } as Env);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const KEY = '202609/0b6c1f3e-5d7a-4c1e-9a55-3c2f1e0d9b8a';

  it('grava, lê e remove pelo mesmo caminho', async () => {
    await storage.put(KEY, Buffer.from('conteúdo'));
    expect((await storage.read(KEY)).toString()).toBe('conteúdo');
    await storage.remove(KEY);
    await expect(storage.read(KEY)).rejects.toThrow();
  });

  it('lê o arquivo aos poucos, inteiro ou só o trecho pedido', async () => {
    await storage.put(KEY, Buffer.from('0123456789'));
    const text = async (range: { start: number; end: number } | null) =>
      (await buffer(storage.openRead(KEY, range))).toString();
    expect(await text(null)).toBe('0123456789');
    expect(await text({ start: 2, end: 5 })).toBe('2345');
  });

  it('não sobrescreve uma chave existente e remove sem erro o que não existe', async () => {
    await storage.put(KEY, Buffer.from('a'));
    await expect(storage.put(KEY, Buffer.from('b'))).rejects.toThrow();
    await storage.remove('202609/ffffffff-ffff-4fff-8fff-ffffffffffff');
  });

  it('recusa chaves que sairiam da pasta', async () => {
    await expect(storage.read('../etc/passwd')).rejects.toThrow(
      'Chave de armazenamento inválida',
    );
    await expect(
      storage.put('202609/../../x', Buffer.from('x')),
    ).rejects.toThrow('Chave de armazenamento inválida');
  });
});
