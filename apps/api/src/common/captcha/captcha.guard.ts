import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPTCHA_HEADER } from '@central/contracts';
import type { Request } from 'express';
import { ApiException } from '../http/api-exception.js';
import { CAPTCHA_VERIFIER, type CaptchaVerifier } from './captcha-verifier.js';

const CAPTCHA_REQUIRED = 'central:captcha-required';

/** Exige o token anti-robô (Turnstile) quando as chaves estão configuradas. */
export const RequireCaptcha = () => SetMetadata(CAPTCHA_REQUIRED, true);

/**
 * Roda depois do limite de tentativas: robôs barrados pelo limite não chegam
 * a gerar chamadas à Cloudflare.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CAPTCHA_VERIFIER) private readonly verifier: CaptchaVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      CAPTCHA_REQUIRED,
      [context.getHandler(), context.getClass()],
    );
    if (!required || !this.verifier.enabled) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = req.header(CAPTCHA_HEADER);
    if (!token || !(await this.verifier.verify(token, req.ip))) {
      throw ApiException.captchaFailed();
    }
    return true;
  }
}
