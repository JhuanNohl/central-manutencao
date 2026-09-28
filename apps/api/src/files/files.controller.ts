import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_UPLOAD_BYTES,
  uploadFileSchema,
  type UploadFileRequest,
} from '@central/contracts';
import { ApiException } from '../common/http/api-exception.js';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequireAnyPermission } from '../identity/decorators.js';
import { FilesService } from './files.service.js';

/**
 * O multipart chega com o nome em Latin-1; os navegadores enviam UTF-8.
 * Nomes que já eram ASCII não mudam.
 */
function decodeFileName(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}

/** Envio de arquivos temporários, antes do vínculo a um atendimento. */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Multipart com um campo `file` e a finalidade em `purpose`. */
  @Post()
  @RequireAnyPermission('rma.own.create', 'rma.write')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 },
    }),
  )
  upload(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(uploadFileSchema)) body: UploadFileRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw ApiException.validation([
        { path: 'file', message: 'Selecione um arquivo.' },
      ]);
    }
    return this.files.upload(
      auth.account.id,
      body.purpose,
      decodeFileName(file.originalname),
      file.buffer,
    );
  }
}
