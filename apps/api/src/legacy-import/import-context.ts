import { randomBytes } from 'node:crypto';
import type { InvoiceAddress, Role } from '@central/contracts';
import { eq } from 'drizzle-orm';
import { hashPassword, isLegacyHash } from '../common/crypto/passwords.js';
import type { Executor } from '../database/database.types.js';
import { accounts } from '../database/schema/index.js';
import type { FileStorage } from '../files/file-storage.js';
import type { ImportReport } from './import-report.js';
import type { LegacySource } from './legacy-source.js';

export interface ImportOptions {
  dryRun: boolean;
  /** E-mail próprio de cada agente (staff_id → e-mail), mantido fora do git. */
  staffEmails: ReadonlyMap<number, string>;
  /** Caixa do setor: nunca vira login de uma pessoa. */
  maintenanceInbox: string | undefined;
  /** CNPJ e endereço da fábrica, para validar o XML da nota pelas regras atuais. */
  invoiceRecipientDocument: string | undefined;
  invoiceRecipientAddress: InvoiceAddress | undefined;
  slaHours: number;
  /** Versão vigente do termo, que conta como aceita pelos clientes importados. */
  termsVersion: string;
}

export interface ImportContext {
  db: Executor;
  source: LegacySource;
  storage: FileStorage;
  options: ImportOptions;
  report: ImportReport;
}

/** Tamanho da senha aleatória das contas sem senha aproveitável. */
const UNUSABLE_PASSWORD_BYTES = 32;

/**
 * Senha da conta importada. O bcrypt do legado entra como está e é convertido
 * no primeiro login; sem ele, uma senha aleatória que ninguém conhece, e a
 * pessoa entra por "Esqueci minha senha". Fora da transação: o hash é caro.
 */
export function importedPasswordHash(
  legacyHash: string | null,
): Promise<string> {
  if (legacyHash && isLegacyHash(legacyHash))
    return Promise.resolve(legacyHash);
  return hashPassword(
    randomBytes(UNUSABLE_PASSWORD_BYTES).toString('base64url'),
  );
}

export async function accountByEmail(
  db: Executor,
  email: string,
): Promise<{ id: string; role: Role } | null> {
  const [row] = await db
    .select({ id: accounts.id, role: accounts.role })
    .from(accounts)
    .where(eq(accounts.email, email));
  return row ?? null;
}

export function normalizedEmail(value: string | null): string | null {
  const email = (value ?? '').trim().toLowerCase();
  return email || null;
}
