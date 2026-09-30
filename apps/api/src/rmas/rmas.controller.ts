import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  assignRmaSchema,
  cancelRmaSchema,
  changeItemStageSchema,
  changePrioritySchema,
  listRmasQuerySchema,
  openRmaForCustomerSchema,
  registerReceiptSchema,
  sendRmaMessageSchema,
  type AssignRmaRequest,
  type CancelRmaRequest,
  type ChangeItemStageRequest,
  type ChangePriorityRequest,
  type ListRmasQuery,
  type OpenRmaForCustomerRequest,
  type RegisterReceiptRequest,
  type SendRmaMessageRequest,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import { fileResponse } from '../files/file-response.js';
import { FilesService } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequirePermissions } from '../identity/decorators.js';
import { RmaManagementService } from './rma-management.service.js';
import { RmaMessagesService } from './rma-messages.service.js';
import { RmaOpeningService } from './rma-opening.service.js';
import { RmaReceiptsService } from './rma-receipts.service.js';
import { RmaStagesService } from './rma-stages.service.js';
import { RmasService } from './rmas.service.js';

/** Chamados na visão da equipe. */
@Controller('rmas')
@RequirePermissions('rma.read')
export class RmasController {
  constructor(
    private readonly rmas: RmasService,
    private readonly opening: RmaOpeningService,
    private readonly receipts: RmaReceiptsService,
    private readonly management: RmaManagementService,
    private readonly stages: RmaStagesService,
    private readonly messages: RmaMessagesService,
    private readonly files: FilesService,
  ) {}

  /** Abertura em nome de um cliente identificado (RN01). */
  @Post()
  @RequirePermissions('rma.write')
  open(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(openRmaForCustomerSchema)) body: OpenRmaForCustomerRequest,
  ) {
    return this.opening.open(auth, body);
  }

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(validate(listRmasQuerySchema)) query: ListRmasQuery,
  ) {
    return this.rmas.list(auth, query);
  }

  /** Contas que podem ser responsáveis; declarada antes de `:number`. */
  @Get('assignees')
  @RequirePermissions('rma.write')
  assignees() {
    return this.management.assignees();
  }

  /** Pelo número público (o mesmo exibido como "#100001"). */
  @Get(':number')
  get(@Param('number', ParseIntPipe) number: number) {
    return this.rmas.get(number);
  }

  /** Registra os itens fisicamente recebidos; cada um inicia o prazo (RF07). */
  @Post(':number/receipts')
  @RequirePermissions('rma.receive')
  registerReceipt(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(registerReceiptSchema)) body: RegisterReceiptRequest,
  ) {
    return this.receipts.register(auth, number, body);
  }

  /** Assumir, transferir ou liberar o chamado. */
  @Patch(':number/assignee')
  @RequirePermissions('rma.write')
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(assignRmaSchema)) body: AssignRmaRequest,
  ) {
    return this.management.assign(auth, number, body);
  }

  @Patch(':number/priority')
  @RequirePermissions('rma.write')
  changePriority(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(changePrioritySchema)) body: ChangePriorityRequest,
  ) {
    return this.management.changePriority(auth, number, body);
  }

  /** Encerra sem apagar, antes de algum equipamento chegar à fábrica. */
  @Post(':number/cancellation')
  @RequirePermissions('rma.write')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(cancelRmaSchema)) body: CancelRmaRequest,
  ) {
    return this.management.cancel(auth, number, body);
  }

  /** O despacho (devolução) exige também `rma.dispatch`, verificado no serviço. */
  @Post(':number/stage-changes')
  @RequirePermissions('rma.write')
  changeStage(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(changeItemStageSchema)) body: ChangeItemStageRequest,
  ) {
    return this.stages.change(auth, number, body);
  }

  @Get(':number/messages')
  listMessages(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.messages.listForStaff(auth, number);
  }

  @Post(':number/messages')
  @RequirePermissions('rma.write')
  sendMessage(
    @CurrentAuth() auth: AuthContext,
    @Param('number', ParseIntPipe) number: number,
    @Body(validate(sendRmaMessageSchema)) body: SendRmaMessageRequest,
  ) {
    return this.messages.sendAsStaff(auth, number, body);
  }

  /** Foto ou documento do chamado. */
  @Get(':number/files/:fileId')
  @Header('Cache-Control', 'private, max-age=3600')
  async file(
    @Param('number', ParseIntPipe) number: number,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    const file = await this.rmas.file(number, fileId);
    return fileResponse(file, await this.files.read(file));
  }
}
