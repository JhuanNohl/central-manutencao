import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { RmasModule } from '../rmas/rmas.module.js';
import { MobileUploadsController } from './mobile-uploads.controller.js';
import { MobileUploadsService } from './mobile-uploads.service.js';
import { UploadSessionsController } from './upload-sessions.controller.js';
import { UploadSessionsService } from './upload-sessions.service.js';

/** Envio de fotos e vídeos pelo celular, a partir de um QR Code. */
@Module({
  imports: [FilesModule, RmasModule],
  controllers: [UploadSessionsController, MobileUploadsController],
  providers: [UploadSessionsService, MobileUploadsService],
})
export class MobileUploadsModule {}
