import { Inject, Injectable } from '@nestjs/common';
import {
  isStaffRole,
  type FieldIssue,
  type FilePurpose,
  type InvoiceValidation,
  type OpenOwnRmaRequest,
  type OpenRmaForCustomerRequest,
  type OpenRmaResponse,
  type WarrantyStatus,
} from '@central/contracts';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { isUniqueViolation } from '../common/http/exception.filter.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Transaction } from '../database/database.types.js';
import {
  rmaDocuments,
  rmaInvoices,
  rmaItemPhotos,
  rmaItems,
  rmas,
} from '../database/schema/index.js';
import { claimTemporaryFiles } from '../files/file-links.js';
import { FilesService } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { isInvoiceAccepted } from './invoice-xml.js';
import { InvoiceValidationService } from './invoice-validation.service.js';
import {
  resolveRequester,
  resolveRmaCustomer,
  type RmaCustomer,
  type RmaRequester,
} from './rma-customer.js';

/** A equipe informa cliente e solicitante; o portal usa o próprio cadastro. */
type OpeningRequest = OpenOwnRmaRequest &
  Partial<Pick<OpenRmaForCustomerRequest, 'customerId' | 'requesterContactId'>>;

interface OpeningPlan {
  request: OpeningRequest;
  customer: RmaCustomer;
  requester: RmaRequester;
  invoice: InvoiceValidation | null;
}

/** Arquivos pedidos para um campo do formulário. */
interface FileClaim {
  path: string;
  purpose: FilePurpose;
  ids: string[];
}

const UNAVAILABLE_FILE =
  'Arquivo não encontrado ou já usado. Envie o arquivo novamente.';

/** Garantia solicitada entra em análise; a decisão é da equipe (P09). */
const initialWarranty = (requested: boolean): WarrantyStatus =>
  requested ? 'em_analise' : 'nao_solicitada';

const itemsLabel = (count: number) =>
  count === 1 ? '1 equipamento' : `${count} equipamentos`;

/**
 * Abertura de RMA pelo cliente ou pela equipe, com as mesmas regras (RN01).
 * A leitura e a validação do XML acontecem antes da transação; RMA, itens,
 * vínculos de arquivos, histórico e aviso gravam juntos ou não gravam (CA17).
 */
@Injectable()
export class RmaOpeningService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly files: FilesService,
    private readonly invoices: InvoiceValidationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  async open(
    auth: AuthContext,
    request: OpeningRequest,
  ): Promise<OpenRmaResponse> {
    if (!isStaffRole(auth.account.role) && !auth.account.emailVerified) {
      throw ApiException.emailNotVerified();
    }
    // Repetição da mesma tentativa (clique duplo, tempo esgotado): devolve o RMA já criado.
    const previous = await this.findPrevious(auth, request.openingKey);
    if (previous) return previous;

    const customer = await resolveRmaCustomer(
      this.db,
      auth,
      request.customerId,
    );
    const plan: OpeningPlan = {
      request,
      customer,
      requester: await resolveRequester(
        this.db,
        auth,
        customer.id,
        request.requesterContactId,
      ),
      invoice: request.invoiceXmlFileId
        ? await this.checkInvoice(auth, request.invoiceXmlFileId, customer)
        : null,
    };

    try {
      return await this.db.transaction((tx) => this.insert(tx, auth, plan));
    } catch (error) {
      // Duas requisições simultâneas com a mesma chave: vale a primeira.
      if (isUniqueViolation(error)) {
        const created = await this.findPrevious(auth, request.openingKey);
        if (created) return created;
      }
      throw error;
    }
  }

  private async findPrevious(
    auth: AuthContext,
    openingKey: string,
  ): Promise<OpenRmaResponse | undefined> {
    const [row] = await this.db
      .select({ number: rmas.number })
      .from(rmas)
      .where(
        and(
          eq(rmas.openedByAccountId, auth.account.id),
          eq(rmas.openingKey, openingKey),
        ),
      );
    return row;
  }

  /** Revalida o arquivo efetivamente enviado, não uma resposta anterior (A4.2). */
  private async checkInvoice(
    auth: AuthContext,
    fileId: string,
    customer: RmaCustomer,
  ): Promise<InvoiceValidation> {
    const content = await this.files
      .readOwnTemporary(auth.account.id, fileId, 'nota_xml')
      .then(({ content }) => content)
      .catch((error: unknown) => {
        if (error instanceof ApiException && error.code === 'NOT_FOUND') {
          throw ApiException.validation([
            { path: 'invoiceXmlFileId', message: UNAVAILABLE_FILE },
          ]);
        }
        throw error;
      });
    const validation = this.invoices.validate(content, customer.document);
    if (!isInvoiceAccepted(validation)) {
      throw ApiException.validation(
        validation.issues
          .filter((issue) => issue.blocking)
          .map((issue) => ({
            path: 'invoiceXmlFileId',
            message: issue.message,
          })),
        'O XML da nota tem divergências.',
      );
    }
    return validation;
  }

  private async insert(
    tx: Transaction,
    auth: AuthContext,
    { request, customer, requester, invoice }: OpeningPlan,
  ): Promise<OpenRmaResponse> {
    const [rma] = await tx
      .insert(rmas)
      .values({
        customerId: customer.id,
        requesterContactId: requester.id,
        openedByAccountId: auth.account.id,
        openingKey: request.openingKey,
      })
      .returning({ id: rmas.id, number: rmas.number });

    const items = await tx
      .insert(rmaItems)
      .values(
        request.items.map((item, index) => ({
          rmaId: rma.id,
          position: index + 1,
          model: item.model,
          serialNumber: item.serialNumber,
          reportedFailure: item.reportedFailure,
          notes: item.notes ?? null,
          warrantyRequested: item.warrantyRequested,
          warranty: initialWarranty(item.warrantyRequested),
        })),
      )
      .returning({ id: rmaItems.id, position: rmaItems.position });
    // Mesma ordem do formulário: a foto fica com o equipamento em que foi enviada.
    const itemIds = items
      .sort((a, b) => a.position - b.position)
      .map((item) => item.id);

    await this.claimFiles(tx, auth, [
      ...request.items.map((item, index) => ({
        path: `items.${index}.photoIds`,
        purpose: 'foto_item' as const,
        ids: item.photoIds,
      })),
      ...this.documentClaims(request),
    ]);

    const photos = request.items.flatMap((item, index) =>
      item.photoIds.map((fileId, photoIndex) => ({
        itemId: itemIds[index],
        fileId,
        position: photoIndex + 1,
      })),
    );
    await tx.insert(rmaItemPhotos).values(photos);
    await this.insertDocuments(tx, rma.id, request, invoice);

    await this.audit.record(tx, {
      actorAccountId: auth.account.id,
      action: 'rma.aberto',
      entityType: 'rma',
      entityId: rma.id,
      data: {
        number: rma.number,
        customerId: customer.id,
        itemCount: items.length,
        documents: this.documentClaims(request).map((claim) => claim.purpose),
      },
    });
    await this.notifications.enqueue(tx, {
      template: 'rma_aberto',
      recipient: requester.email,
      payload: {
        name: requester.name,
        number: String(rma.number),
        itemsLabel: itemsLabel(items.length),
        link: this.links.portalRma(rma.number),
      },
      origin: `rma:${rma.id}`,
      dedupeKey: `rma_aberto:${rma.id}`,
    });
    return { number: rma.number };
  }

  private documentClaims(request: OpeningRequest): FileClaim[] {
    const claims: FileClaim[] = [];
    if (request.invoiceXmlFileId) {
      claims.push({
        path: 'invoiceXmlFileId',
        purpose: 'nota_xml',
        ids: [request.invoiceXmlFileId],
      });
    }
    if (request.declarationFileId) {
      claims.push({
        path: 'declarationFileId',
        purpose: 'declaracao',
        ids: [request.declarationFileId],
      });
    }
    return claims;
  }

  /**
   * Vincula os arquivos de cada campo; se algum não puder ser vinculado, a
   * transação inteira é desfeita e os arquivos continuam temporários.
   */
  private async claimFiles(
    tx: Transaction,
    auth: AuthContext,
    claims: FileClaim[],
  ): Promise<void> {
    const issues: FieldIssue[] = [];
    for (const claim of claims) {
      const claimed = await claimTemporaryFiles(
        tx,
        auth.account.id,
        claim.purpose,
        claim.ids,
      );
      if (claim.ids.some((id) => !claimed.has(id))) {
        issues.push({ path: claim.path, message: UNAVAILABLE_FILE });
      }
    }
    if (issues.length > 0) {
      throw ApiException.validation(
        issues,
        'Alguns arquivos precisam ser enviados novamente.',
      );
    }
  }

  private async insertDocuments(
    tx: Transaction,
    rmaId: string,
    request: OpeningRequest,
    invoice: InvoiceValidation | null,
  ): Promise<void> {
    if (request.declarationFileId) {
      await tx.insert(rmaDocuments).values({
        rmaId,
        kind: 'declaracao',
        fileId: request.declarationFileId,
      });
    }
    if (!request.invoiceXmlFileId || !invoice?.invoice) return;
    const [document] = await tx
      .insert(rmaDocuments)
      .values({
        rmaId,
        kind: 'nota_xml',
        fileId: request.invoiceXmlFileId,
        validationStatus: invoice.status,
        rulesVersion: invoice.rulesVersion,
        issues: invoice.issues,
      })
      .returning({ id: rmaDocuments.id });
    await tx.insert(rmaInvoices).values({
      rmaId,
      documentId: document.id,
      number: invoice.invoice.number,
      issuerName: invoice.invoice.issuerName,
      issuerDocument: invoice.invoice.issuerDocument,
    });
  }
}
