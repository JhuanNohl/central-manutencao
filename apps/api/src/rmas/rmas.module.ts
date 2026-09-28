import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { InvoiceValidationController } from './invoice-validation.controller.js';
import { InvoiceValidationService } from './invoice-validation.service.js';
import { PortalRmasController } from './portal-rmas.controller.js';
import { PortalRmasService } from './portal-rmas.service.js';
import { RmaOpeningService } from './rma-opening.service.js';
import { RmaReceiptsService } from './rma-receipts.service.js';
import { RmaShipmentsService } from './rma-shipments.service.js';
import { RmasController } from './rmas.controller.js';
import { RmasService } from './rmas.service.js';

/** Atendimentos: RMAs, itens, documentação e notas fiscais. */
@Module({
  imports: [FilesModule],
  controllers: [
    RmasController,
    PortalRmasController,
    InvoiceValidationController,
  ],
  providers: [
    RmasService,
    PortalRmasService,
    RmaOpeningService,
    RmaShipmentsService,
    RmaReceiptsService,
    InvoiceValidationService,
  ],
})
export class RmasModule {}
