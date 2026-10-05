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
  createCustomerSchema,
  listCustomersQuerySchema,
  type ContactInput,
  type CreateCustomerRequest,
  type ListCustomersQuery,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { PortalAccessService } from '../identity/portal-access.service.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly portalAccess: PortalAccessService,
  ) {}

  @Get()
  @RequirePermissions('customers.read')
  list(@Query(validate(listCustomersQuerySchema)) query: ListCustomersQuery) {
    return this.customers.list(query);
  }

  @Post()
  // O cadastro já cria o acesso do contato principal ao portal.
  @RequirePermissions('customers.write', 'customers.invite_contact')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(createCustomerSchema)) body: CreateCustomerRequest,
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

  /** Cria a conta de portal do contato, com senha provisória por e-mail. */
  @Post(':id/contacts/:contactId/access')
  @RequirePermissions('customers.invite_contact')
  grantPortalAccess(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.portalAccess.grantForContact(auth, id, contactId);
  }
}
