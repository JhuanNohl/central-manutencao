import { Inject, Injectable } from '@nestjs/common';
import type {
  InvoiceValidation,
  InvoiceValidationView,
  ValidateInvoiceRequest,
} from '@central/contracts';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import { FilesService } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { validateInvoiceXml } from './invoice-xml.js';
import { resolveRmaCustomer } from './rma-customer.js';

/** Validação do XML da nota contra o cliente do atendimento (P04). */
@Injectable()
export class InvoiceValidationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly files: FilesService,
  ) {}

  /**
   * Durante o preenchimento. O resultado identifica o arquivo: o formulário
   * descarta respostas de um arquivo que já foi trocado (CA03).
   */
  async validateTemporary(
    auth: AuthContext,
    request: ValidateInvoiceRequest,
  ): Promise<InvoiceValidationView> {
    const customer = await resolveRmaCustomer(
      this.db,
      auth,
      request.customerId,
    );
    const { content } = await this.files.readOwnTemporary(
      auth.account.id,
      request.fileId,
      'nota_xml',
    );
    return {
      fileId: request.fileId,
      ...this.validate(content, customer.document),
    };
  }

  validate(content: Buffer, customerDocument: string): InvoiceValidation {
    return validateInvoiceXml(content, {
      customerDocument,
      recipientDocument: this.env.INVOICE_RECIPIENT_DOCUMENT,
    });
  }
}
