import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { CaptchaGuard } from './common/captcha/captcha.guard.js';
import { CaptchaModule } from './common/captcha/captcha.module.js';
import { ApiExceptionFilter } from './common/http/exception.filter.js';
import { OriginGuard } from './common/http/origin.guard.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CustomersModule } from './customers/customers.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FilesModule } from './files/files.module.js';
import { UPLOAD_RATE_LIMIT } from './files/upload-limits.js';
import { HealthController } from './health/health.controller.js';
import { AuthGuard } from './identity/auth.guard.js';
import { SENSITIVE_RATE_LIMIT } from './identity/decorators.js';
import { IdentityModule } from './identity/identity.module.js';
import { LegalModule } from './legal/legal.module.js';
import { MobileUploadsModule } from './mobile-uploads/mobile-uploads.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { RmasModule } from './rmas/rmas.module.js';
import { MINUTE_MS } from './common/time/durations.js';

/** Teto geral por IP, folgado para o uso normal de uma tela; protege contra rajadas. */
const GENERAL_REQUESTS_PER_MINUTE = 600;

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    CaptchaModule,
    NotificationsModule,
    IdentityModule,
    CustomersModule,
    FilesModule,
    LegalModule,
    RmasModule,
    MobileUploadsModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [
          { name: 'geral', ttl: MINUTE_MS, limit: GENERAL_REQUESTS_PER_MINUTE },
          {
            // Login, cadastro e links por e-mail: limite reduzido por IP.
            name: 'sensivel',
            ttl: MINUTE_MS,
            limit: env.AUTH_RATE_LIMIT_PER_MINUTE,
            skipIf: (context) =>
              !Reflect.getMetadata(SENSITIVE_RATE_LIMIT, context.getHandler()),
          },
          {
            // Envio de arquivos (computador e celular): corpo grande, limite próprio.
            name: 'envio',
            ttl: MINUTE_MS,
            limit: env.UPLOAD_RATE_LIMIT_PER_MINUTE,
            skipIf: (context) =>
              !Reflect.getMetadata(UPLOAD_RATE_LIMIT, context.getHandler()),
          },
        ],
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    // Ordem: origem (CSRF) → limite de tentativas → anti-robô → sessão e permissões.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: CaptchaGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
