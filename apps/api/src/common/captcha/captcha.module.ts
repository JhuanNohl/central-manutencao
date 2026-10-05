import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { CaptchaController } from './captcha.controller.js';
import { CaptchaGuard } from './captcha.guard.js';
import {
  CAPTCHA_VERIFIER,
  DisabledCaptchaVerifier,
  TurnstileVerifier,
} from './captcha-verifier.js';

/** Verificação anti-robô (Cloudflare Turnstile) das rotas públicas. */
@Module({
  controllers: [CaptchaController],
  providers: [
    {
      provide: CAPTCHA_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.TURNSTILE_SECRET_KEY
          ? new TurnstileVerifier(env.TURNSTILE_SECRET_KEY)
          : new DisabledCaptchaVerifier(),
    },
    CaptchaGuard,
  ],
  exports: [CaptchaGuard, CAPTCHA_VERIFIER],
})
export class CaptchaModule {}
