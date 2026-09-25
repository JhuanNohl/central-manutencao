import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { type AuthContext, toSessionAccount } from './auth-context.js';
import { AuthService, type SignedIn } from './auth.service.js';
import { CurrentAuth, Public, SensitiveRateLimit } from './decorators.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('login')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(validate(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.signIn(res, await this.auth.login(body));
  }

  @Post('register')
  @Public()
  @SensitiveRateLimit()
  async register(
    @Body(validate(registerRequestSchema)) body: RegisterRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.signIn(res, await this.auth.register(body));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth);
    clearSessionCookie(res, this.env);
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
    await this.auth.requestPasswordReset(body.email);
  }

  @Post('password-reset/confirm')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(validate(passwordResetConfirmSchema)) body: PasswordResetConfirm,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.confirmPasswordReset(body);
    // Todas as sessões foram revogadas; a atual (se houver) também.
    clearSessionCookie(res, this.env);
  }

  @Post('email-verification/confirm')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(
    @Body(validate(emailVerificationConfirmSchema))
    body: EmailVerificationConfirm,
  ): Promise<void> {
    await this.auth.confirmEmail(body.token);
  }

  @Post('email-verification/resend')
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.ACCEPTED)
  async resendEmailVerification(
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.auth.resendEmailVerification(auth);
  }

  @Post('password')
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(changePasswordSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.auth.changePassword(auth, body);
  }

  private signIn(res: Response, signedIn: SignedIn): MeResponse {
    setSessionCookie(
      res,
      this.env,
      signedIn.session.token,
      signedIn.session.expiresAt,
    );
    return { account: toSessionAccount(signedIn.account) };
  }
}
