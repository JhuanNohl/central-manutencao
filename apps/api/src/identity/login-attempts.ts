import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/http/api-exception.js';
import { MINUTE_MS } from '../common/time/durations.js';

/**
 * Tentativas erradas de login por e-mail. O login não tem captcha (decisão de
 * 08/10/2026): além do limite por IP, cada e-mail aceita poucas senhas
 * erradas seguidas, para tentativas vindas de vários IPs não testarem senhas
 * à vontade. Vale também para e-mail sem conta, para não revelar quem tem.
 */
export const LOGIN_FAILURES_LIMIT = 5;
export const LOGIN_LOCK_MS = 15 * MINUTE_MS;

/** Acima disso, as entradas vencidas são descartadas para a memória não crescer. */
const PRUNE_THRESHOLD = 10_000;

const TOO_MANY_FAILURES =
  'Muitas tentativas de entrar com este e-mail. Aguarde alguns minutos ou use "Esqueci minha senha".';

interface Failures {
  count: number;
  firstAt: number;
}

/** Em memória: a API roda num processo só; reiniciar zera as contagens. */
@Injectable()
export class LoginAttempts {
  private readonly failures = new Map<string, Failures>();

  ensureAllowed(email: string): void {
    const entry = this.current(email);
    if (entry && entry.count >= LOGIN_FAILURES_LIMIT) {
      throw ApiException.tooManyRequests(TOO_MANY_FAILURES);
    }
  }

  recordFailure(email: string): void {
    const entry = this.current(email);
    this.failures.set(
      email,
      entry
        ? { ...entry, count: entry.count + 1 }
        : { count: 1, firstAt: Date.now() },
    );
    if (this.failures.size > PRUNE_THRESHOLD) this.prune();
  }

  clear(email: string): void {
    this.failures.delete(email);
  }

  /** Falhas dentro da janela; a janela começa na primeira falha. */
  private current(email: string): Failures | null {
    const entry = this.failures.get(email);
    if (!entry) return null;
    if (Date.now() - entry.firstAt >= LOGIN_LOCK_MS) {
      this.failures.delete(email);
      return null;
    }
    return entry;
  }

  private prune(): void {
    for (const email of this.failures.keys()) this.current(email);
  }
}
