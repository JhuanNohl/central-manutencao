import {
  type RmaDocumentKind,
  type RmaDocumentView,
  type RmaInvoiceView,
  DocumentationPendingReason,
} from '@central/contracts';
import { Download } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { formatDocument } from '../../lib/format';
import {
  DOCUMENTATION_PENDING_STYLES,
  INVOICE_VALIDATION_STYLES,
} from './rma-styles';
import type { ReactNode } from 'react';

const DOCUMENT_LABELS: Record<RmaDocumentKind, string> = {
  nota_xml: 'XML da nota fiscal',
  declaracao: 'Declaração de conteúdo',
};

/** Documentação do RMA: arquivos, resultado da validação e dados da nota. */
export function RmaDocuments(props: {
  documents: RmaDocumentView[];
  invoices: RmaInvoiceView[];
  fileUrl: (fileId: string) => string;
  pending: DocumentationPendingReason | null;
  /** Envio da documentação pendente, quando quem vê pode enviar. */
  action?: ReactNode;
}) {
  return (
    <section className="card">
      <h2>Documentação</h2>
      {props.pending && (
        <div className="card-section document-pending">
          <Badge status={DOCUMENTATION_PENDING_STYLES[props.pending]} />
          {props.action}
        </div>
      )}
      {props.documents.length === 0 && props.invoices.length === 0 && (
        <p className="muted">Nenhum documento anexado.</p>
      )}
      <div className="stack">
        {props.documents.map((document) => (
          <div key={document.id} className="document-row">
            <span className="strong">{DOCUMENT_LABELS[document.kind]}</span>
            <a href={props.fileUrl(document.file.id)} className="with-icon">
              <Download size={16} aria-hidden />
              {document.file.name}
            </a>
            {document.validation && (
              <Badge
                status={INVOICE_VALIDATION_STYLES[document.validation.status]}
              />
            )}
          </div>
        ))}
        {props.invoices.map((invoice) => (
          <dl className="details" key={invoice.number}>
            <dt>Nota fiscal</dt>
            <dd>{invoice.number}</dd>
            <dt>Emitente</dt>
            <dd>{invoice.issuerName}</dd>
            <dt>CNPJ/CPF</dt>
            <dd>{formatDocument(invoice.issuerDocument)}</dd>
          </dl>
        ))}
      </div>
    </section>
  );
}
