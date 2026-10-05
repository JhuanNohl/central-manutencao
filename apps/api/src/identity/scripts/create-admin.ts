/**
 * Cria o primeiro administrador de um ambiente novo.
 * Uso: npm run admin:create -w @central/api -- --email admin@empresa.com.br --name "Nome Completo"
 * No contêiner: node dist/identity/scripts/create-admin.js --email … --name …
 *
 * A senha provisória aparece só aqui, uma vez, e é trocada no primeiro acesso.
 */
import { parseArgs } from 'node:util';
import { loadEnvFile, parseEnv } from '../../config/env.js';
import { createDatabase, createPool } from '../../database/connection.js';
import {
  administratorInputSchema,
  createAdministrator,
} from '../administrator-bootstrap.js';
import { temporaryCredentials } from '../../common/crypto/passwords.js';

loadEnvFile();
const env = parseEnv();
const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});
const input = administratorInputSchema.safeParse(values);
if (!input.success) {
  console.error('Informe --email e --name (nome completo) válidos.');
  process.exit(1);
}

const credentials = await temporaryCredentials();
const pool = createPool(env.DATABASE_URL);
try {
  await createAdministrator(createDatabase(pool), input.data, credentials);
  console.log(`Administrador criado: ${input.data.email}`);
  console.log(`Senha provisória: ${credentials.temporaryPassword}`);
  console.log('A troca é obrigatória no primeiro acesso.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
