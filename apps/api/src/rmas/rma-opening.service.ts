import { Inject, Injectable } from '@nestjs/common';
import {
  isStaffRole,
  STAFF_OPENING_STAGE,
  type InvoiceValidation,
  type OpenRmaResponse,
  type WarrantyStatus,
} from '@central/contracts';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/db/errors.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Transaction } from '../database/database.types.js';
import { rmaItemPhotos, rmaItems, rmas } from '../database/schema/index.js';
import { FilesService } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import {
  recordTermsAcceptance,
  type TermsAcceptance,
} from '../legal/terms-acceptance.js';
import { WarrantyTermsService } from '../legal/warranty-terms.service.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InvoiceValidationService } from './invoice-validation.service.js';
import {
  resolveRequester,
  resolveRmaCustomer,
  type RmaCustomer,
  type RmaRequester,
} from './rma-customer.js';
import { recordReceipt } from './rma-movements.js';
import {
  claimOpeningFiles,
  insertRmaDocuments,
  openingDocumentPurposes,
  type OpeningRequest,
} from './rma-opening-documents.js';
import { itemLine } from './rma-presentation.js';
import { RmaTeamNotices } from './rma-team-notices.js';
import { HOUR_MS } from '../common/time/durations.js';

interface OpeningPlan {
  request: OpeningRequest;
  customer: RmaCustomer;
  requester: RmaRequester;
  invoice: InvoiceValidation | null;
  /** Aceite do termo pelo cliente; `renewed` quando aceito nesta abertura. */
  terms: TermsAcceptance | null;
}

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
    @Inject(ENV) private readonly env: Env,
    private readonly files: FilesService,
    private readonly invoices: InvoiceValidationService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
    private readonly team: RmaTeamNotices,
    private readonly terms: WarrantyTermsService,
  ) {}

  async open(
    auth: AuthContext,
    request: OpeningRequest,
  ): Promise<OpenRmaResponse> {
    // A equipe não aceita o termo em nome do cliente.
    const terms = isStaffRole(auth.account.role)
      ? null
      : this.terms.acceptanceOnOpening(
          request.termsVersion,
          auth.account.acceptedTermsVersion,
        );
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
        ? await this.invoices.acceptForRma(
            auth.account.id,
            request.invoiceXmlFileId,
            customer.document,
          )
        : null,
      terms,
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

  private async insert(
    tx: Transaction,
    auth: AuthContext,
    { request, customer, requester, invoice, terms }: OpeningPlan,
  ): Promise<OpenRmaResponse> {
    // Pela equipe, o equipamento já está na fábrica (fluxo de 01/10/2026).
    const atFactory = isStaffRole(auth.account.role);
    const openedAt = new Date();
    const termsVersion = terms?.version ?? null;
    const termsAcceptedAt = terms
      ? await recordTermsAcceptance(tx, auth.account.id, terms, openedAt)
      : null;
    const [rma] = await tx
      .insert(rmas)
      .values({
        customerId: customer.id,
        requesterContactId: requester.id,
        openedByAccountId: auth.account.id,
        openingKey: request.openingKey,
        termsVersion,
        termsAcceptedAt,
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
          videoFileId: item.videoId ?? null,
          ...(atFactory ? this.factoryEntry(openedAt) : {}),
        })),
      )
      .returning({ id: rmaItems.id, position: rmaItems.position });
    // Mesma ordem do formulário: a foto fica com o equipamento em que foi enviada.
    const itemIds = items
      .sort((a, b) => a.position - b.position)
      .map((item) => item.id);

    await claimOpeningFiles(tx, auth.account.id, request);

    if (atFactory) {
      await recordReceipt(tx, {
        rmaId: rma.id,
        receivedByAccountId: auth.account.id,
        receivedAt: openedAt,
        itemIds,
      });
    }

    const photos = request.items.flatMap((item, index) =>
      item.photoIds.map((fileId, photoIndex) => ({
        itemId: itemIds[index],
        fileId,
        position: photoIndex + 1,
      })),
    );
    await tx.insert(rmaItemPhotos).values(photos);
    await insertRmaDocuments(tx, rma.id, request, invoice);

    await this.audit.record(tx, {
      actorAccountId: auth.account.id,
      action: 'rma.aberto',
      entityType: 'rma',
      entityId: rma.id,
      data: {
        number: rma.number,
        customerId: customer.id,
        itemCount: items.length,
        documents: openingDocumentPurposes(request),
        ...(termsVersion && { termsVersion }),
      },
    });
    await this.notifications.enqueue(tx, {
      template: atFactory ? 'rma_aberto_na_fabrica' : 'rma_aberto',
      recipient: requester.email,
      payload: {
        name: requester.name,
        number: String(rma.number),
        itemsLabel: itemsLabel(items.length),
        link: this.links.portalRma(rma.number),
        ...(atFactory && {
          dueAtLabel: this.links.expiry(
            new Date(openedAt.getTime() + this.env.RMA_SLA_HOURS * HOUR_MS),
          ),
        }),
        ...(termsAcceptedAt && {
          termsVersion,
          termsAcceptedAtLabel: this.links.expiry(termsAcceptedAt),
        }),
      },
      origin: `rma:${rma.id}`,
      dedupeKey: `rma_aberto:${rma.id}`,
    });
    // Aberto pelo cliente, o chamado chega ao setor sem responsável.
    if (!atFactory) {
      await this.team.notify(tx, rma, 'aberto', {
        items: request.items.map(itemLine),
      });
    }
    return { number: rma.number };
  }

  /**
   * Item aberto pela equipe: recebido na abertura e já em diagnóstico, com o
   * prazo iniciado e a duração configurada gravada no item (CA15).
   */
  private factoryEntry(openedAt: Date) {
    return {
      stage: STAFF_OPENING_STAGE,
      receivedAt: openedAt,
      slaStartedAt: openedAt,
      slaHours: this.env.RMA_SLA_HOURS,
    };
  }
}
