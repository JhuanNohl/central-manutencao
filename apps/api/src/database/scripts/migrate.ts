import { loadEnvFile, parseEnv } from '../../config/env.js';
import { createDatabase, createPool, runMigrations } from '../connection.js';

loadEnvFile();
const env = parseEnv();
const pool = createPool(env.DATABASE_URL);

try {
  await runMigrations(createDatabase(pool));
  console.log('Migrations aplicadas.');
} finally {
  await pool.end();
}
