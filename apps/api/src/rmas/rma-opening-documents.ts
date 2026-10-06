import type {
  FieldIssue,
  FilePurpose,
  InvoiceValidation,
  OpenOwnRmaRequest,
  OpenRmaForCustomerRequest,
} from '@central/contracts';
import { ApiException } from '../common/http/api-exception.js';
import type { Transaction } from '../database/database.types.js';
import { rmaDocuments, rmaInvoices } from '../database/schema/index.js';
import { claimTemporaryFiles, UNAVAILABLE_FILE } from '../files/file-links.js';

/**
 * A equipe informa cliente e solicitante; o portal usa o próprio cadastro e
 * traz o aceite do termo de garantia.
 */
export type OpeningRequest = Omit<OpenOwnRmaRequest, 'termsVersion'> &
  Partial<
    Pick<OpenOwnRmaRequest, 'termsVersion'> &
      Pick<OpenRmaForCustomerRequest, 'customerId' | 'requesterContactId'>
  >;

/** Arquivos pedidos para um campo do formulário. */
interface FileClaim {
  path: string;
  purpose: FilePurpose;
  ids: string[];
}

/** XML da nota e/ou declaração de conteúdo de um RMA. */
export interface RmaDocumentFiles {
  invoiceXmlFileId?: string;
  declarationFileId?: string;
}

function documentClaims(request: RmaDocumentFiles): FileClaim[] {
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

/** Documentos anexados, registrados no histórico da abertura. */
export function openingDocumentPurposes(
  request: RmaDocumentFiles,
): FilePurpose[] {
  return documentClaims(request).map((claim) => claim.purpose);
}

/** Fotos e vídeo de cada equipamento e os documentos, campo a campo. */
function openingFileClaims(request: OpeningRequest): FileClaim[] {
  return [
    ...request.items.map((item, index) => ({
      path: `items.${index}.photoIds`,
      purpose: 'foto_item' as const,
      ids: item.photoIds,
    })),
    ...request.items.flatMap((item, index) =>
      item.videoId
        ? [
            {
              path: `items.${index}.videoId`,
              purpose: 'video_item' as const,
              ids: [item.videoId],
            },
          ]
        : [],
    ),
    ...documentClaims(request),
  ];
}

/**
 * Vincula os arquivos de cada campo; se algum não puder ser vinculado, a
 * transação inteira é desfeita e os arquivos continuam temporários.
 */
async function claimFiles(
  tx: Transaction,
  accountId: string,
  claims: FileClaim[],
): Promise<void> {
  const issues: FieldIssue[] = [];
  for (const claim of claims) {
    const claimed = await claimTemporaryFiles(
      tx,
      accountId,
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

/** Fotos, vídeos e documentos da abertura. */
export function claimOpeningFiles(
  tx: Transaction,
  accountId: string,
  request: OpeningRequest,
): Promise<void> {
  return claimFiles(tx, accountId, openingFileClaims(request));
}

/** Só a documentação, enviada depois da abertura. */
export function claimDocumentFiles(
  tx: Transaction,
  accountId: string,
  documents: RmaDocumentFiles,
): Promise<void> {
  return claimFiles(tx, accountId, documentClaims(documents));
}

/** Declaração e XML do RMA; o XML aceito também registra a nota fiscal. */
export async function insertRmaDocuments(
  tx: Transaction,
  rmaId: string,
  request: RmaDocumentFiles,
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
