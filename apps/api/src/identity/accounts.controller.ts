import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  accountStatusChangeSchema,
  changeRoleSchema,
  listAccountsQuerySchema,
  type AccountStatusChangeRequest,
  type ChangeRoleRequest,
  type ListAccountsQuery,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import { AccountsService } from './accounts.service.js';
import type { AuthContext } from './auth-context.js';
import { CurrentAuth, RequirePermissions } from './decorators.js';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions('accounts.read')
  list(@Query(validate(listAccountsQuerySchema)) query: ListAccountsQuery) {
    return this.accounts.list(query);
  }

  @Patch(':id/role')
  @RequirePermissions('accounts.manage')
  changeRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validate(changeRoleSchema)) body: ChangeRoleRequest,
  ) {
    return this.accounts.changeRole(auth, id, body);
  }

  @Post(':id/disable')
  @RequirePermissions('accounts.manage')
  @HttpCode(HttpStatus.OK)
  disable(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validate(accountStatusChangeSchema)) body: AccountStatusChangeRequest,
  ) {
    return this.accounts.disable(auth, id, body);
  }

  @Post(':id/enable')
  @RequirePermissions('accounts.manage')
  @HttpCode(HttpStatus.OK)
  enable(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validate(accountStatusChangeSchema)) body: AccountStatusChangeRequest,
  ) {
    return this.accounts.enable(auth, id, body);
  }
}
