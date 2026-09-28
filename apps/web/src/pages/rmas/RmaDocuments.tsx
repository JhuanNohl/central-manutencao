import type {
  RmaDocumentKind,
  RmaDocumentView,
  RmaInvoiceView,
} from '@central/contracts';
import { Download } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { formatDocument } from '../../lib/format';
import { INVOICE_VALIDATION_STYLES } from './rma-styles';

const DOCUMENT_LABELS: Record<RmaDocumentKind, string> = {
  nota_xml: 'XML da nota fiscal',
  declaracao: 'Declaração de conteúdo',
};

/** Documentação do RMA: arquivos, resultado da validação e dados da nota. */
export function RmaDocuments(props: {
  documents: RmaDocumentView[];
  invoices: RmaInvoiceView[];
  fileUrl: (fileId: string) => string;
}) {
  return (
    <section className="card">
      <h2>Documentação</h2>
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
