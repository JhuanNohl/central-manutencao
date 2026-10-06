import { randomInt } from 'node:crypto';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

// Argon2id com parâmetros recomendados pela OWASP (19 MiB, 2 iterações).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

/**
 * Hash bcrypt do sistema anterior (osTicket: `$2a$`, `$2b$` ou `$2y$`),
 * importado como está. Serve só para entrar: no primeiro acesso a senha é
 * gravada de novo com Argon2id (`AuthService.login`).
 */
const LEGACY_BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isLegacyHash(hash: string): boolean {
  return LEGACY_BCRYPT_HASH.test(hash);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    if (isLegacyHash(hash)) {
      // `$2y$` (PHP) é o mesmo algoritmo do `$2b$`.
      return await bcrypt.compare(
        password,
        hash.replace(/^\$2y\$/, () => '$2b$'),
      );
    }
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Sem 0/O, 1/l/I: a senha provisória é lida no e-mail e digitada. */
const TEMPORARY_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMPORARY_PASSWORD_LENGTH = 12;

/**
 * Senha provisória única por conta, sorteada com gerador criptográfico.
 * Vale até o primeiro acesso, quando a troca é obrigatória.
 */
export function generateTemporaryPassword(): string {
  return Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () =>
      TEMPORARY_PASSWORD_ALPHABET[
        randomInt(TEMPORARY_PASSWORD_ALPHABET.length)
      ],
  ).join('');
}

let dummyHash: Promise<string> | undefined;

/**
 * Executa uma verificação descartável quando a conta não existe, para que o
 * tempo de resposta do login não revele quais e-mails estão cadastrados.
 */
export async function simulatePasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('senha-inexistente-para-equalizar-tempo');
  await verifyPassword(await dummyHash, password);
}

/** Senha provisória e o seu hash, para a conta criada pela equipe. */
export interface TemporaryCredentials {
  temporaryPassword: string;
  passwordHash: string;
}

/** O hash é caro: quem chama gera as credenciais antes de abrir a transação. */
export async function temporaryCredentials(): Promise<TemporaryCredentials> {
  const temporaryPassword = generateTemporaryPassword();
  return {
    temporaryPassword,
    passwordHash: await hashPassword(temporaryPassword),
  };
}
