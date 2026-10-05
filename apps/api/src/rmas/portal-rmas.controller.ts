import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  confirmShipmentSchema,
  listOwnRmasQuerySchema,
  openOwnRmaSchema,
  sendRmaMessageSchema,
  type ConfirmShipmentRequest,
  type ListOwnRmasQuery,
  type OpenOwnRmaRequest,
  type SendRmaMessageRequest,
} from '@central/contracts';
import type { Response } from 'express';
import { validate } from '../common/http/zod-validation.pipe.js';
import { sendFile } from '../files/file-response.js';
import { FilesService } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { RmaNumberPipe } from './rma-number.pipe.js';
import { PortalRmasService } from './portal-rmas.service.js';
import { RmaMessagesService } from './rma-messages.service.js';
import { RmaOpeningService } from './rma-opening.service.js';
import { RmaShipmentsService } from './rma-shipments.service.js';

/** Atendimentos do próprio cliente, no portal. */
@Controller('portal/rmas')
@RequirePermissions('rma.own.read')
export class PortalRmasController {
  constructor(
    private readonly rmas: PortalRmasService,
    private readonly opening: RmaOpeningService,
    private readonly shipments: RmaShipmentsService,
    private readonly messages: RmaMessagesService,
    private readonly files: FilesService,
  ) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(validate(listOwnRmasQuerySchema)) query: ListOwnRmasQuery,
  ) {
    return this.rmas.list(auth, query);
  }

  @Post()
  @RequirePermissions('rma.own.create')
  open(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(openOwnRmaSchema)) body: OpenOwnRmaRequest,
  ) {
    return this.opening.open(auth, body);
  }

  @Get(':number')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('number', RmaNumberPipe) number: number,
  ) {
    return this.rmas.get(auth, number);
  }

  /** Confirma o envio à fábrica dos itens selecionados (RF06). */
  @Post(':number/shipments')
  @RequirePermissions('rma.own.ship')
  confirmShipment(
    @CurrentAuth() auth: AuthContext,
    @Param('number', RmaNumberPipe) number: number,
    @Body(validate(confirmShipmentSchema)) body: ConfirmShipmentRequest,
  ) {
    return this.shipments.confirm(auth, number, body);
  }

  @Get(':number/messages')
  listMessages(
    @CurrentAuth() auth: AuthContext,
    @Param('number', RmaNumberPipe) number: number,
  ) {
    return this.messages.listForCustomer(auth, number);
  }

  @Post(':number/messages')
  @RequirePermissions('rma.own.message')
  sendMessage(
    @CurrentAuth() auth: AuthContext,
    @Param('number', RmaNumberPipe) number: number,
    @Body(validate(sendRmaMessageSchema)) body: SendRmaMessageRequest,
  ) {
    return this.messages.sendAsCustomer(auth, number, body);
  }

  @Get(':number/files/:fileId')
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param('number', RmaNumberPipe) number: number,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.rmas.file(auth, number, fileId);
    await sendFile(response, this.files, file, range);
  }
}
