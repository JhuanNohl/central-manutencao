import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  validateInvoiceRequestSchema,
  type ValidateInvoiceRequest,
} from '@central/contracts';
import { validate } from '../common/http/zod-validation.pipe.js';
import type { AuthContext } from '../identity/auth-context.js';
import { CurrentAuth, RequireAnyPermission } from '../identity/decorators.js';
import { InvoiceValidationService } from './invoice-validation.service.js';

/** Validação do XML enviado, durante o preenchimento da abertura. */
@Controller('invoice-validations')
export class InvoiceValidationController {
  constructor(private readonly validation: InvoiceValidationService) {}

  @Post()
  @HttpCode(200)
  @RequireAnyPermission('rma.own.create', 'rma.write')
  validate(
    @CurrentAuth() auth: AuthContext,
    @Body(validate(validateInvoiceRequestSchema)) body: ValidateInvoiceRequest,
  ) {
    return this.validation.validateTemporary(auth, body);
  }
}
