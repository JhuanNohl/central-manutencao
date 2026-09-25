import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  contactInputSchema,
  customerInputSchema,
  listCustomersQuerySchema,
  type ContactInput,
  type CustomerInput,
  type ListCustomersQuery,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { InvitationsService } from '../identity/invitations.service.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  @RequirePermissions('customers.read')
  list(@Query(validate(listCustomersQuerySchema)) query: ListCustomersQuery) {
    return this.customers.list(query);
  }

  @Post()
  @RequirePermissions('customers.write')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(customerInputSchema)) body: CustomerInput,
  ) {
    return this.customers.create(auth, body);
  }

  /** Equipe consulta qualquer cliente; conta de cliente, apenas o próprio. */
  @Get(':id')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customers.get(auth, id);
  }

  @Post(':id/contacts')
  @RequirePermissions('customers.write')
  addContact(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validate(contactInputSchema)) body: ContactInput,
  ) {
    return this.customers.addContact(auth, id, body);
  }

  @Post(':id/contacts/:contactId/invitation')
  @RequirePermissions('customers.invite_contact')
  inviteContact(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.invitations.createForContact(auth, id, contactId);
  }
}
