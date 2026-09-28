import {
  formatDocument,
  normalizeDocument,
  type InvoiceData,
  type InvoiceIssue,
  type InvoiceValidation,
} from '@central/contracts';
import { XMLParser } from 'fast-xml-parser';
import { readSafeXml } from '../files/file-content.js';

/**
 * Versão da tabela de regras (P04). Muda sempre que uma regra entra, sai ou
 * muda de efeito; o resultado gravado na abertura registra a versão aplicada.
 */
export const INVOICE_RULES_VERSION = '2026-09-28.1';

export interface InvoiceExpectations {
  /** CPF/CNPJ do cliente do atendimento, que emite a nota de remessa. */
  customerDocument: string;
  /** CNPJ da fábrica; sem configuração, a regra do destinatário não se aplica. */
  recipientDocument?: string;
}

interface InvoiceRule {
  id: string;
  blocking: boolean;
  /** Mensagem da divergência, ou `null` quando a nota atende à regra. */
  check(invoice: InvoiceData, expected: InvoiceExpectations): string | null;
}

/**
 * Base mínima aprovada em 28/09/2026. CFOP e tributos entram aqui quando a
 * tabela revisada pelo responsável chegar; por ora os CFOPs só são exibidos.
 */
const RULES: InvoiceRule[] = [
  {
    id: 'numero_nota',
    blocking: true,
    check: (invoice) =>
      invoice.number ? null : 'A nota não informa o número (nNF).',
  },
  {
    id: 'emitente_cliente',
    blocking: true,
    check: (invoice, expected) =>
      invoice.issuerDocument === expected.customerDocument
        ? null
        : `O emitente da nota (${formatDocument(invoice.issuerDocument) || 'não informado'}) não é o cliente do atendimento (${formatDocument(expected.customerDocument)}).`,
  },
  {
    id: 'destinatario_fabrica',
    blocking: true,
    check: (invoice, expected) =>
      !expected.recipientDocument ||
      invoice.recipientDocument === expected.recipientDocument
        ? null
        : `O destinatário da nota (${formatDocument(invoice.recipientDocument ?? '') || 'não informado'}) não é a fábrica (${formatDocument(expected.recipientDocument)}).`,
  },
];

const parser = new XMLParser({
  // Namespaces variam entre emissores; os nomes das tags da NF-e não.
  removeNSPrefix: true,
  ignoreAttributes: true,
  // Mantém tudo como texto: número da nota e documentos têm zeros à esquerda.
  parseTagValue: false,
  isArray: (name) => name === 'det',
});

type XmlNode = Record<string, unknown>;

const node = (value: unknown): XmlNode | undefined =>
  typeof value === 'object' && value !== null ? (value as XmlNode) : undefined;

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** Documento de uma parte da nota (CNPJ ou CPF). */
const partyDocument = (party: XmlNode | undefined): string =>
  normalizeDocument(text(party?.CNPJ) || text(party?.CPF));

/** Lê os dados da NF-e (`nfeProc/NFe/infNFe` ou `NFe/infNFe`). */
export function readInvoice(xml: string): InvoiceData | null {
  const root = node(parser.parse(xml));
  const nfe = node(node(root?.nfeProc)?.NFe) ?? node(root?.NFe);
  const info = node(nfe?.infNFe);
  if (!info) return null;

  const ide = node(info.ide);
  const issuer = node(info.emit);
  const recipient = node(info.dest);
  const items = Array.isArray(info.det) ? info.det : [];
  const cfops = items
    .map((item) => text(node(node(item)?.prod)?.CFOP))
    .filter(Boolean);

  return {
    number: text(ide?.nNF),
    series: text(ide?.serie) || null,
    issuerName: text(issuer?.xNome),
    issuerDocument: partyDocument(issuer),
    recipientName: text(recipient?.xNome) || null,
    recipientDocument: partyDocument(recipient) || null,
    cfops: [...new Set(cfops)],
  };
}

const structureIssue = (message: string): InvoiceIssue => ({
  rule: 'estrutura_nfe',
  message,
  blocking: true,
});

/**
 * Valida o XML contra as regras vigentes. Nunca lança: erro inesperado vira
 * "não foi possível validar", distinto de divergência documental (RN12).
 */
export function validateInvoiceXml(
  content: Buffer,
  expected: InvoiceExpectations,
): InvoiceValidation {
  const base = { rulesVersion: INVOICE_RULES_VERSION };
  try {
    const xml = readSafeXml(content);
    if (!xml) {
      return {
        ...base,
        status: 'com_divergencias',
        issues: [structureIssue('O arquivo não é um XML válido.')],
        invoice: null,
      };
    }
    const invoice = readInvoice(xml);
    if (!invoice) {
      return {
        ...base,
        status: 'com_divergencias',
        issues: [structureIssue('O XML não é de uma NF-e (infNFe ausente).')],
        invoice: null,
      };
    }
    const issues = RULES.flatMap((rule) => {
      const message = rule.check(invoice, expected);
      return message
        ? [{ rule: rule.id, message, blocking: rule.blocking }]
        : [];
    });
    return {
      ...base,
      status: issues.length > 0 ? 'com_divergencias' : 'valido',
      issues,
      invoice,
    };
  } catch {
    return {
      ...base,
      status: 'nao_validado',
      issues: [
        {
          rule: 'validador',
          message: 'Não foi possível validar o arquivo agora. Tente novamente.',
          blocking: true,
        },
      ],
      invoice: null,
    };
  }
}

/** A nota só acompanha a abertura se nenhuma divergência bloquear. */
export function isInvoiceAccepted(validation: InvoiceValidation): boolean {
  return (
    validation.status !== 'nao_validado' &&
    !validation.issues.some((issue) => issue.blocking)
  );
}
