import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_FAILURES_LIMIT,
  LOGIN_LOCK_MS,
  LoginAttempts,
} from './login-attempts.js';

describe('tentativas de login por e-mail', () => {
  let attempts: LoginAttempts;
  const email = 'cliente@exemplo.local';

  beforeEach(() => {
    vi.useFakeTimers();
    attempts = new LoginAttempts();
  });
  afterEach(() => vi.useRealTimers());

  const fail = (times: number) => {
    for (let i = 0; i < times; i++) attempts.recordFailure(email);
  };

  it('bloqueia o e-mail depois de várias senhas erradas', () => {
    fail(LOGIN_FAILURES_LIMIT - 1);
    expect(() => attempts.ensureAllowed(email)).not.toThrow();
    fail(1);
    expect(() => attempts.ensureAllowed(email)).toThrow('Muitas tentativas');
    expect(() => attempts.ensureAllowed('outro@exemplo.local')).not.toThrow();
  });

  it('libera depois do prazo', () => {
    fail(LOGIN_FAILURES_LIMIT);
    vi.advanceTimersByTime(LOGIN_LOCK_MS);
    expect(() => attempts.ensureAllowed(email)).not.toThrow();
  });

  it('o login certo zera a contagem', () => {
    fail(LOGIN_FAILURES_LIMIT - 1);
    attempts.clear(email);
    fail(LOGIN_FAILURES_LIMIT - 1);
    expect(() => attempts.ensureAllowed(email)).not.toThrow();
  });
});
