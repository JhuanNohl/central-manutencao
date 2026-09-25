import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { ApiExceptionFilter } from './common/http/exception.filter.js';
import { OriginGuard } from './common/http/origin.guard.js';
import { ConfigModule, ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { CustomersModule } from './customers/customers.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { AuthGuard } from './identity/auth.guard.js';
import { SENSITIVE_RATE_LIMIT } from './identity/decorators.js';
import { IdentityModule } from './identity/identity.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    NotificationsModule,
    IdentityModule,
    CustomersModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [
          { name: 'geral', ttl: 60_000, limit: 600 },
          {
            // Login, cadastro e links por e-mail: limite reduzido por IP.
            name: 'sensivel',
            ttl: 60_000,
            limit: env.AUTH_RATE_LIMIT_PER_MINUTE,
            skipIf: (context) =>
              !Reflect.getMetadata(SENSITIVE_RATE_LIMIT, context.getHandler()),
          },
        ],
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    // Ordem: origem (CSRF) → limite de tentativas → sessão e permissões.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
