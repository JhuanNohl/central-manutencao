import { Global, Module } from '@nestjs/common';
import { AccountTokensService } from './account-tokens.service.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { SessionsService } from './sessions.service.js';

/** Identidade e acesso: contas, sessões, convites e autorização. */
@Global()
@Module({
  controllers: [AuthController, AccountsController, InvitationsController],
  providers: [
    AccountTokensService,
    AccountsService,
    AuthGuard,
    AuthService,
    InvitationsService,
    SessionsService,
  ],
  exports: [AuthGuard, AuthService, InvitationsService, SessionsService],
})
export class IdentityModule {}
