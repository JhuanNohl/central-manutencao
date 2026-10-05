import { Controller, Get } from '@nestjs/common';
import type { WarrantyTerms } from '@central/contracts';
import { Public } from '../identity/decorators.js';
import { WarrantyTermsService } from './warranty-terms.service.js';

@Controller('legal')
export class LegalController {
  constructor(private readonly terms: WarrantyTermsService) {}

  /** Texto integral exibido antes do aceite: no autocadastro e na abertura. */
  @Get('warranty-terms')
  @Public()
  warrantyTerms(): WarrantyTerms {
    return this.terms.current();
  }
}
