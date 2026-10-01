import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MAX_UPLOAD_BYTES,
  mobileUploadFileSchema,
  mobileUploadTokenSchema,
  type MobileUploadFileRequest,
  type MobileUploadTokenRequest,
} from '@central/contracts';
import { ApiException } from '../common/http/api-exception.js';
import { validate } from '../common/http/zod-validation.pipe.js';
import { decodeFileName } from '../files/files.controller.js';
import { Public } from '../identity/decorators.js';
import { MobileUploadsService } from './mobile-uploads.service.js';

/**
 * Lado do celular: sem login, só com o token do QR Code. O token vai no
 * corpo (nunca na URL), para não aparecer em logs de acesso.
 */
@Controller('mobile-uploads')
@Public()
export class MobileUploadsController {
  constructor(private readonly uploads: MobileUploadsService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  describe(
    @Body(validate(mobileUploadTokenSchema)) body: MobileUploadTokenRequest,
  ) {
    return this.uploads.describe(body.token);
  }

  /** Multipart com `token`, `media` (foto ou vídeo) e o arquivo em `file`. */
  @Post('files')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 },
    }),
  )
  upload(
    @Body(validate(mobileUploadFileSchema)) body: MobileUploadFileRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw ApiException.validation([
        { path: 'file', message: 'Selecione um arquivo.' },
      ]);
    }
    return this.uploads.upload(
      body.token,
      body.media,
      decodeFileName(file.originalname),
      file.buffer,
    );
  }
}
