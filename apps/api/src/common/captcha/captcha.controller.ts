import { Controller, Get, Inject } from '@nestjs/common';
import type { CaptchaConfig } from '@central/contracts';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Public } from '../../identity/decorators.js';

@Controller('captcha')
export class CaptchaController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Chave pública do widget, lida em tempo de execução (sem rebuild da web). */
  @Get('config')
  @Public()
  config(): CaptchaConfig {
    return { siteKey: this.env.TURNSTILE_SITE_KEY ?? null };
  }
}
