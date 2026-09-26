import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { listRmasQuerySchema, type ListRmasQuery } from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { RmasService } from './rmas.service.js';

/** Chamados na visão da equipe. */
@Controller('rmas')
@RequirePermissions('rma.read')
export class RmasController {
  constructor(private readonly rmas: RmasService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(validate(listRmasQuerySchema)) query: ListRmasQuery,
  ) {
    return this.rmas.list(auth, query);
  }

  /** Pelo número público (o mesmo exibido como "#100001"). */
  @Get(':number')
  get(@Param('number', ParseIntPipe) number: number) {
    return this.rmas.get(number);
  }
}
