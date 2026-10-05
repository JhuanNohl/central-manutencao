import { Module } from '@nestjs/common';
import { FILE_STORAGE, LocalDiskFileStorage } from './file-storage.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { TemporaryFilesCleaner } from './temporary-files-cleaner.service.js';
import { UploadSlots, UploadSlotsGuard } from './upload-limits.js';

/** Arquivos privados: envio, armazenamento e limpeza de temporários (P03). */
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    TemporaryFilesCleaner,
    UploadSlots,
    UploadSlotsGuard,
    { provide: FILE_STORAGE, useClass: LocalDiskFileStorage },
  ],
  exports: [FilesService, UploadSlots, UploadSlotsGuard],
})
export class FilesModule {}
