import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  acceptInvitationSchema,
  createStaffInvitationSchema,
  invitationLookupSchema,
  listInvitationsQuerySchema,
  type AcceptInvitationRequest,
  type CreateStaffInvitationRequest,
  type InvitationLookupRequest,
  type ListInvitationsQuery,
  type MeResponse,
} from '@central/contracts';
import type { Response } from 'express';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from './auth-context.js';
import {
  CurrentAuth,
  Public,
  RequirePermissions,
  SensitiveRateLimit,
} from './decorators.js';
import { InvitationsService } from './invitations.service.js';
import { SessionCookies } from './session-cookie.js';

@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly cookies: SessionCookies,
  ) {}

  @Get()
  @RequirePermissions('accounts.manage')
  list(
    @Query(validate(listInvitationsQuerySchema)) query: ListInvitationsQuery,
  ) {
    return this.invitations.list(query);
  }

  @Post('staff')
  @RequirePermissions('accounts.manage')
  createStaff(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(createStaffInvitationSchema))
    body: CreateStaffInvitationRequest,
  ) {
    return this.invitations.createStaff(auth, body);
  }

  @Post(':id/revoke')
  @RequirePermissions('accounts.manage')
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitations.revoke(auth, id);
  }

  /** O token vai no corpo, nunca na URL, para não aparecer em logs. */
  @Post('lookup')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.OK)
  lookup(
    @Body(validate(invitationLookupSchema)) body: InvitationLookupRequest,
  ) {
    return this.invitations.lookup(body.token);
  }

  @Post('accept')
  @Public()
  @SensitiveRateLimit()
  @HttpCode(HttpStatus.OK)
  async accept(
    @Body(validate(acceptInvitationSchema)) body: AcceptInvitationRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    return this.cookies.start(res, await this.invitations.accept(body));
  }
}
