import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Database } from './database.types.js';
import * as schema from './schema/index.js';

export const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

/**
 * Tempos máximos do pool: uma conexão presa (consulta lenta, transação
 * esquecida) é encerrada em vez de travar a API inteira esperando conexão.
 */
const POOL_LIMITS = {
  max: 10,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
} as const;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, ...POOL_LIMITS });
}

export function createDatabase(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
