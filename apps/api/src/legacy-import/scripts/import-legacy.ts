/**
 * Importa o sistema anterior (osTicket) para a Central de Manutenção.
 * Passo a passo e de-para em docs/5-homologacao-e-migracao/5.2-migracao-do-sistema-anterior.md.
 *
 * Uso (no contêiner da API, com acesso aos dois bancos):
 *   LEGACY_DATABASE_URL=mysql://usuario:senha@host:3306/osticket \
 *   node dist/legacy-import/scripts/import-legacy.js [opções]
 *
 *   --dry-run                 ensaio: confere tudo e não grava nada
 *   --staff-emails <arquivo>  JSON { "<staff_id>": "<e-mail próprio>" }, fora do git
 *   --report <arquivo>        grava o relatório completo em JSON
 *   --legacy-utc-offset=<±hh:mm>  fuso das datas no banco do legado (padrão +00:00)
 *
 * Rodar de novo só acrescenta o que faltou: o que já foi importado é pulado.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadEnvFile, parseEnv } from '../../config/env.js';
import { createDatabase, createPool } from '../../database/connection.js';
import {
  LocalDiskFileStorage,
  type FileStorage,
} from '../../files/file-storage.js';
import { WarrantyTermsService } from '../../legal/warranty-terms.service.js';
import { importLegacy } from '../legacy-importer.js';
import { MysqlLegacySource } from '../mysql-legacy-source.js';

/** No ensaio nada vai para o disco: o banco é desfeito e os arquivos também. */
const DISCARDING_STORAGE: FileStorage = {
  put: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  read: () => Promise.reject(new Error('Armazenamento de ensaio.')),
  openRead: () => {
    throw new Error('Armazenamento de ensaio.');
  },
};

const UTC_OFFSET = /^[+-]\d{2}:\d{2}$/;

const staffEmailsSchema = z.record(
  z.string().regex(/^\d+$/, 'use o staff_id do legado como chave'),
  z.email(),
);

async function staffEmailsFrom(
  path: string | undefined,
): Promise<Map<number, string>> {
  if (!path) return new Map();
  const parsed = staffEmailsSchema.parse(
    JSON.parse(await readFile(path, 'utf8')),
  );
  return new Map(
    Object.entries(parsed).map(([id, email]) => [
      Number(id),
      email.trim().toLowerCase(),
    ]),
  );
}

loadEnvFile();
const env = parseEnv();
const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'staff-emails': { type: 'string' },
    report: { type: 'string' },
    'legacy-utc-offset': { type: 'string', default: '+00:00' },
  },
});
const legacyUrl = process.env.LEGACY_DATABASE_URL;
const utcOffset = values['legacy-utc-offset'];
if (!legacyUrl || !/^(mysql|mariadb):\/\//.test(legacyUrl)) {
  console.error(
    'Defina LEGACY_DATABASE_URL=mysql://usuario:senha@host:3306/banco.',
  );
  process.exit(1);
}
if (!UTC_OFFSET.test(utcOffset)) {
  console.error(
    'Use --legacy-utc-offset=±hh:mm, ex.: --legacy-utc-offset=-03:00.',
  );
  process.exit(1);
}

const dryRun = values['dry-run'];
const source = new MysqlLegacySource(
  legacyUrl.replace(/^mariadb:/, 'mysql:'),
  utcOffset,
);
const pool = createPool(env.DATABASE_URL);
try {
  const report = await importLegacy(
    createDatabase(pool),
    source,
    dryRun ? DISCARDING_STORAGE : new LocalDiskFileStorage(env),
    {
      dryRun,
      staffEmails: await staffEmailsFrom(values['staff-emails']),
      maintenanceInbox: env.MAINTENANCE_INBOX_EMAIL,
      invoiceRecipientDocument: env.INVOICE_RECIPIENT_DOCUMENT,
      invoiceRecipientAddress: env.INVOICE_RECIPIENT_ADDRESS,
      slaHours: env.RMA_SLA_HOURS,
      termsVersion: new WarrantyTermsService(env).current().version,
    },
  );
  console.log(report.summary());
  if (values.report) {
    await writeFile(values.report, JSON.stringify(report.toJSON(), null, 2));
    console.log(`\nRelatório completo: ${values.report}`);
  }
  if (report.failed) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await source.close();
  await pool.end();
}
