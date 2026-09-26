import { Inject, Injectable } from '@nestjs/common';
import type { MeResponse } from '@central/contracts';
import type { CookieOptions, Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { toSessionAccount } from './auth-context.js';
import type { SignedIn } from './sessions.service.js';

export const SESSION_COOKIE = 'central_sid';

/** Emissão e remoção do cookie de sessão, com as mesmas opções nos dois casos. */
@Injectable()
export class SessionCookies {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Grava o cookie da sessão aberta e devolve a conta para o frontend. */
  start(res: Response, signedIn: SignedIn): MeResponse {
    res.cookie(SESSION_COOKIE, signedIn.session.token, {
      ...this.options(),
      expires: signedIn.session.expiresAt,
    });
    return { account: toSessionAccount(signedIn.account) };
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.options());
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    };
  }
}
