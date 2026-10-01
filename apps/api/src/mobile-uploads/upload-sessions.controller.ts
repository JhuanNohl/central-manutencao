import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  createUploadSessionSchema,
  type CreateUploadSessionRequest,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequireAnyPermission } from '../identity/decorators.js';
import { UploadSessionsService } from './upload-sessions.service.js';

/**
 * QR Code de envio pelo celular, do lado do computador. A validação exige
 * também `rma.write`, verificado no serviço.
 */
@Controller('upload-sessions')
@RequireAnyPermission('rma.own.create', 'rma.write')
export class UploadSessionsController {
  constructor(private readonly sessions: UploadSessionsService) {}

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(createUploadSessionSchema)) body: CreateUploadSessionRequest,
  ) {
    return this.sessions.create(auth, body);
  }

  /** Consultado enquanto o QR Code está aberto, para receber os arquivos. */
  @Get(':id')
  view(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessions.view(auth, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessions.close(auth, id);
  }
}
