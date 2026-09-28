import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { InvoiceValidationController } from './invoice-validation.controller.js';
import { InvoiceValidationService } from './invoice-validation.service.js';
import { RmasController } from './rmas.controller.js';
import { RmasService } from './rmas.service.js';

/** Atendimentos: RMAs, itens, documentação e notas fiscais. */
@Module({
  imports: [FilesModule],
  controllers: [RmasController, InvoiceValidationController],
  providers: [RmasService, InvoiceValidationService],
})
export class RmasModule {}
