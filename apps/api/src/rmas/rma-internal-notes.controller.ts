import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  addRmaInternalNoteSchema,
  type AddRmaInternalNoteRequest,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { RmaInternalNotesService } from './rma-internal-notes.service.js';
import { RmaNumberPipe } from './rma-number.pipe.js';

/** Anotações internas do chamado; o portal não tem rota para elas (RN11). */
@Controller('rmas/:number/internal-notes')
export class RmaInternalNotesController {
  constructor(private readonly notes: RmaInternalNotesService) {}

  @Get()
  @RequirePermissions('rma.read')
  list(@Param('number', RmaNumberPipe) number: number) {
    return this.notes.list(number);
  }

  @Post()
  @RequirePermissions('rma.write')
  add(
    @CurrentAuth() auth: AuthContext,
    @Param('number', RmaNumberPipe) number: number,
    @Body(validate(addRmaInternalNoteSchema)) body: AddRmaInternalNoteRequest,
  ) {
    return this.notes.add(auth, number, body);
  }
}
