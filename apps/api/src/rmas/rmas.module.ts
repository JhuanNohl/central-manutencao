import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { LegalModule } from '../legal/legal.module.js';
import { InvoiceValidationController } from './invoice-validation.controller.js';
import { InvoiceValidationService } from './invoice-validation.service.js';
import { PortalRmasController } from './portal-rmas.controller.js';
import { PortalRmasService } from './portal-rmas.service.js';
import { RmaManagementService } from './rma-management.service.js';
import { RmaMessagesService } from './rma-messages.service.js';
import { RmaOpeningService } from './rma-opening.service.js';
import { RmaReceiptsService } from './rma-receipts.service.js';
import { RmaShipmentsService } from './rma-shipments.service.js';
import { RmaStagesService } from './rma-stages.service.js';
import { RmaRequesterNotices } from './rma-requester-notices.js';
import { RmaTeamNotices } from './rma-team-notices.js';
import { RmaValidationVideosService } from './rma-validation-videos.service.js';
import { RmasController } from './rmas.controller.js';
import { RmasService } from './rmas.service.js';
import { RmaDocumentsService } from './rma-documents.service.js';
import { RmaInternalNotesController } from './rma-internal-notes.controller.js';
import { RmaInternalNotesService } from './rma-internal-notes.service.js';

/** Atendimentos: RMAs, itens, documentação e notas fiscais. */
@Module({
  imports: [FilesModule, LegalModule],
  controllers: [
    RmasController,
    RmaInternalNotesController,
    PortalRmasController,
    InvoiceValidationController,
  ],
  providers: [
    RmasService,
    RmaDocumentsService,
    RmaInternalNotesService,
    PortalRmasService,
    RmaOpeningService,
    RmaShipmentsService,
    RmaReceiptsService,
    RmaManagementService,
    RmaStagesService,
    RmaMessagesService,
    RmaValidationVideosService,
    RmaRequesterNotices,
    RmaTeamNotices,
    InvoiceValidationService,
  ],
  exports: [RmaValidationVideosService],
})
export class RmasModule {}
