import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.js';

export const SESSION_COOKIE = 'central_sid';

function options(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookie(
  res: Response,
  env: Env,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE, token, { ...options(env), expires: expiresAt });
}

export function clearSessionCookie(res: Response, env: Env): void {
  res.clearCookie(SESSION_COOKIE, options(env));
}
