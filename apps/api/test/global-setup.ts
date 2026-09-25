import { sql } from 'drizzle-orm';
import {
  createDatabase,
  createPool,
  runMigrations,
} from '../src/database/connection.js';
import { TEST_ENV } from '../vitest.config.e2e.js';

/** Recria o esquema do banco de testes e aplica as migrations do zero. */
export default async function setup(): Promise<void> {
  if (!TEST_ENV.DATABASE_URL.includes('_test')) {
    throw new Error('Os testes de integração só rodam em um banco "*_test".');
  }
  const pool = createPool(TEST_ENV.DATABASE_URL);
  try {
    const db = createDatabase(pool);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
