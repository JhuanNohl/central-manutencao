import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller.js';
import { WarrantyTermsService } from './warranty-terms.service.js';

@Module({
  controllers: [LegalController],
  providers: [WarrantyTermsService],
  exports: [WarrantyTermsService],
})
export class LegalModule {}
