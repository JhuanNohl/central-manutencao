import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de 256 bits, seguro para URL. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash usado para guardar e localizar tokens sem armazená-los em claro. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
