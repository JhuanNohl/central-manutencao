import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
  changePasswordSchema,
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type MeResponse,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type RegisterRequest,
} from '@central/contracts';
import type { Response } from 'express';
import { RequireCaptcha } from '../common/captcha/captcha.guard.js';
import { validate } from '../common/http/zod-validation.pipe.js';
import { type AuthContext, toSessionAccount } from './auth-context.js';
import { AuthService } from './auth.service.js';
import {
  AllowedBeforePasswordChange,
  CurrentAuth,
  Public,
  SensitiveRateLimit,
} from './decorators.js';
import { PasswordsService } from './passwords.service.js';
import { SessionCookies } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordsService,
    private readonly cookies: SessionCookies,
  ) {}

  @Post('login')
  @RequireCaptcha()
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(validate(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.cookies.start(res, await this.auth.login(body));
  }

  @Post('register')
  @RequireCaptcha()
  @Public()
  @SensitiveRateLimit()
  async register(
    @Body(validate(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.cookies.start(res, await this.auth.register(body));
  }

  @Post('logout')
  @AllowedBeforePasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth);
    this.cookies.clear(res);
  }

  @Get('me')
  @AllowedBeforePasswordChange()
  me(@CurrentAuth() auth: AuthContext): MeResponse {
    return { account: toSessionAccount(auth.account) };
  }

  @Post('password-reset/request')
  @RequireCaptcha()
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body(validate(passwordResetRequestSchema)) body: PasswordResetRequest,
  ): Promise<void> {
    await this.passwords.requestReset(body.email);
  }

  @Post('password-reset/confirm')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(validate(passwordResetConfirmSchema)) body: PasswordResetConfirm,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.passwords.confirmReset(body);
    // Todas as sessões foram revogadas; a atual (se houver) também.
    this.cookies.clear(res);
  }

  @Post('password')
  @AllowedBeforePasswordChange()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(changePasswordSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.passwords.change(auth, body);
  }
}
