import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_POLICIES,
  type RmaDocumentKind,
  type SendRmaDocumentsRequest,
} from '@central/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Transaction } from '../database/database.types.js';
import {
  customers,
  rmaDocuments,
  rmaInvoices,
} from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { InvoiceValidationService } from './invoice-validation.service.js';
import { documentationPendingOf } from './rma-documentation-state.js';
import { touchRma } from './rma-movements.js';
import {
  claimDocumentFiles,
  insertRmaDocuments,
  openingDocumentPurposes,
} from './rma-opening-documents.js';
import { findOwnRma, findRma, lockOpenRma, type RmaRow } from './rma-scope.js';
import { RmaTeamNotices } from './rma-team-notices.js';

function kindsOf(request: SendRmaDocumentsRequest): RmaDocumentKind[] {
  return [
    ...(request.invoiceXmlFileId ? (['nota_xml'] as const) : []),
    ...(request.declarationFileId ? (['declaracao'] as const) : []),
  ];
}

/**
 * Documentação enviada depois da abertura, para resolver a pendência (nota
 * com divergências ou sem documento, como nos chamados do sistema anterior).
 * O XML passa pelas mesmas regras da abertura; o documento novo substitui o
 * do mesmo tipo, que fica citado no histórico.
 */
@Injectable()
export class RmaDocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly invoices: InvoiceValidationService,
    private readonly audit: AuditService,
    private readonly team: RmaTeamNotices,
  ) {}

  async sendAsCustomer(
    auth: AuthContext,
    number: number,
    request: SendRmaDocumentsRequest,
  ): Promise<void> {
    await this.send(auth, await findOwnRma(this.db, auth, number), request);
  }

  async sendAsStaff(
    auth: AuthContext,
    number: number,
    request: SendRmaDocumentsRequest,
  ): Promise<void> {
    await this.send(auth, await findRma(this.db, number), request);
  }

  private async send(
    auth: AuthContext,
    rma: RmaRow,
    request: SendRmaDocumentsRequest,
  ): Promise<void> {
    // Leitura e validação do XML antes da transação.
    const invoice = request.invoiceXmlFileId
      ? await this.invoices.acceptForRma(
          auth.account.id,
          request.invoiceXmlFileId,
          await this.customerDocumentOf(rma.customerId),
        )
      : null;

    await this.db.transaction(async (tx) => {
      const locked = await lockOpenRma(tx, rma.id);
      const pending = (await documentationPendingOf(tx, [locked])).get(
        locked.id,
      );
      if (!pending) {
        throw ApiException.conflict(
          'A documentação deste chamado já está em ordem.',
        );
      }
      await claimDocumentFiles(tx, auth.account.id, request);
      const replacedFileIds = await this.removeDocuments(
        tx,
        rma.id,
        kindsOf(request),
      );
      await insertRmaDocuments(tx, rma.id, request, invoice);
      await touchRma(tx, rma.id);

      const purposes = openingDocumentPurposes(request);
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.documentacao_enviada',
        entityType: 'rma',
        entityId: rma.id,
        data: { pending, documents: purposes, replacedFileIds },
      });
      await this.team.notify(tx, locked, 'documentacao', {
        items: purposes.map((purpose) => FILE_POLICIES[purpose].label),
      });
    });
  }

  /** Documentos substituídos (e a nota lida do XML antigo); devolve os arquivos. */
  private async removeDocuments(
    tx: Transaction,
    rmaId: string,
    kinds: RmaDocumentKind[],
  ): Promise<string[]> {
    const replaced = await tx
      .select({ id: rmaDocuments.id, fileId: rmaDocuments.fileId })
      .from(rmaDocuments)
      .where(
        and(eq(rmaDocuments.rmaId, rmaId), inArray(rmaDocuments.kind, kinds)),
      );
    if (replaced.length === 0) return [];
    const ids = replaced.map((document) => document.id);
    await tx.delete(rmaInvoices).where(inArray(rmaInvoices.documentId, ids));
    await tx.delete(rmaDocuments).where(inArray(rmaDocuments.id, ids));
    return replaced.map((document) => document.fileId);
  }

  private async customerDocumentOf(customerId: string): Promise<string> {
    const [customer] = await this.db
      .select({ document: customers.document })
      .from(customers)
      .where(eq(customers.id, customerId));
    return customer.document;
  }
}
