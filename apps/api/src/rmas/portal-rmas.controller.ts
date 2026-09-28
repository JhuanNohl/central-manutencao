import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  confirmShipmentSchema,
  listOwnRmasQuerySchema,
  openOwnRmaSchema,
  type ConfirmShipmentRequest,
  type ListOwnRmasQuery,
  type OpenOwnRmaRequest,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import { fileResponse } from '../files/file-response.js';
import { FilesService } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { PortalRmasService } from './portal-rmas.service.js';
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
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.rmas.get(auth, number);
  }

  /** Confirma o envio à fábrica dos itens selecionados (RF06). */
  @Post(':number/shipments')
  @RequirePermissions('rma.own.ship')
  confirmShipment(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(confirmShipmentSchema)) body: ConfirmShipmentRequest,
  ) {
    return this.shipments.confirm(auth, number, body);
  }

  @Get(':number/files/:fileId')
  @Header('Cache-Control', 'private, max-age=3600')
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    const file = await this.rmas.file(auth, number, fileId);
    return fileResponse(file, await this.files.read(file));
  }
}
