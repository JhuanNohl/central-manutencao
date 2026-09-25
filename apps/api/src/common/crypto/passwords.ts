import argon2 from 'argon2';

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

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
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
