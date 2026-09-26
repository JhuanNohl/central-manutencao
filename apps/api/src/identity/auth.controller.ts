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
  emailVerificationConfirmSchema,
  loginRequestSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
  type ChangePasswordRequest,
  type EmailVerificationConfirm,
  type LoginRequest,
  type MeResponse,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type RegisterRequest,
} from '@central/contracts';
import type { Response } from 'express';
import { validate } from '../common/http/zod-validation.pipe.js';
import { type AuthContext, toSessionAccount } from './auth-context.js';
import { AuthService } from './auth.service.js';
import { CurrentAuth, Public, SensitiveRateLimit } from './decorators.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordsService } from './passwords.service.js';
import { SessionCookies } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordsService,
    private readonly emailVerification: EmailVerificationService,
    private readonly cookies: SessionCookies,
  ) {}

  @Post('login')
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
  @Public()
  @SensitiveRateLimit()
  async register(
    @Body(validate(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.cookies.start(res, await this.auth.register(body));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth);
    this.cookies.clear(res);
  }

  @Get('me')
  me(@CurrentAuth() auth: AuthContext): MeResponse {
    return { account: toSessionAccount(auth.account) };
  }

  @Post('password-reset/request')
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
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(changePasswordSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.passwords.change(auth, body);
  }

  @Post('email-verification/confirm')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(
    @Body(validate(emailVerificationConfirmSchema))
    body: EmailVerificationConfirm,
  ): Promise<void> {
    await this.emailVerification.confirm(body.token);
  }

  @Post('email-verification/resend')
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.ACCEPTED)
  async resendEmailVerification(
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.emailVerification.resend(auth);
  }
}
