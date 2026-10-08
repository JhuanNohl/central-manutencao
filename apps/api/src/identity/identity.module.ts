import { Global, Module } from '@nestjs/common';
import { LegalModule } from '../legal/legal.module.js';
import { AccountTokensService } from './account-tokens.service.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { PasswordsService } from './passwords.service.js';
import { LoginAttempts } from './login-attempts.js';
import { PortalAccessService } from './portal-access.service.js';
import { SessionCookies } from './session-cookie.js';
import { SessionsService } from './sessions.service.js';

/** Identidade e acesso: contas, sessões, convites e autorização. */
@Global()
@Module({
  imports: [LegalModule],
  controllers: [AuthController, AccountsController, InvitationsController],
  providers: [
    AccountTokensService,
    AccountsService,
    AuthGuard,
    AuthService,
    InvitationsService,
    LoginAttempts,
    PasswordsService,
    PortalAccessService,
    SessionCookies,
    SessionsService,
  ],
  exports: [AuthGuard, PortalAccessService, SessionsService],
})
export class IdentityModule {}
