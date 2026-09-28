import {
  FILE_POLICIES,
  type FilePurpose,
  type InvoiceValidationView,
} from '@central/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { FileUp, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { errorMessage } from '../../../api/client';
import { Badge } from '../../../components/Badge';
import type { FieldErrors } from '../../../lib/forms';
import { INVOICE_VALIDATION_STYLES } from '../rma-styles';
import type { UploadSlot } from './draft';
import { UploadStatus } from './UploadStatus';

/** Um arquivo de documentação: escolha, andamento e remoção. */
function DocumentSlot(props: {
  purpose: FilePurpose;
  label: string;
  slot: UploadSlot | null;
  error?: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  const policy = FILE_POLICIES[props.purpose];
  return (
    <div className="field">
      <span className="field-label">{props.label}</span>
      {props.slot ? (
        <div className="document-row">
          <span className="strong">{props.slot.name}</span>
          <UploadStatus slot={props.slot} />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remover ${props.label}`}
            onClick={props.onRemove}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <label className="btn btn-secondary btn-sm file-button">
          <FileUp size={16} aria-hidden />
          Escolher arquivo
          <input
            type="file"
            accept={policy.extensions.join(',')}
            className="visually-hidden"
            aria-label={`Escolher arquivo: ${props.label}`}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onSelect(file);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {props.children}
      <span id={`${id}-hint`} className="hint">
        {policy.extensions.join(', ')} de até {policy.maxBytes / (1024 * 1024)}{' '}
        MB.
      </span>
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}

/** Resultado da validação do XML: validando, válido, divergências ou falha. */
function InvoiceCheck({
  check,
}: {
  check: UseQueryResult<InvoiceValidationView>;
}) {
  if (check.isFetching) {
    return (
      <span className="upload-status" role="status">
        <LoaderCircle size={16} aria-hidden />
        Validando…
      </span>
    );
  }
  if (check.isError) {
    return (
      <div className="stack-sm" role="alert">
        <Badge status={INVOICE_VALIDATION_STYLES.nao_validado} />
        <span className="hint">{errorMessage(check.error)}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void check.refetch()}
        >
          <RefreshCw size={16} aria-hidden />
          Validar novamente
        </button>
      </div>
    );
  }
  if (!check.data) return null;
  return (
    <div className="stack-sm" aria-live="polite">
      <Badge status={INVOICE_VALIDATION_STYLES[check.data.status]} />
      {check.data.invoice && (
        <span className="hint">
          NF {check.data.invoice.number} · {check.data.invoice.issuerName}
        </span>
      )}
      {check.data.issues.length > 0 && (
        <ul className="issue-list">
          {check.data.issues.map((issue) => (
            <li key={issue.rule}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Documentação do RMA: XML da nota e/ou declaração de conteúdo (RF05). */
export function DocumentsFields(props: {
  invoiceXml: UploadSlot | null;
  declaration: UploadSlot | null;
  invoiceCheck: UseQueryResult<InvoiceValidationView>;
  errors: FieldErrors;
  onSelect: (kind: 'invoiceXml' | 'declaration', file: File) => void;
  onRemove: (kind: 'invoiceXml' | 'declaration') => void;
}) {
  return (
    <fieldset>
      <legend>Documentação</legend>
      <p className="hint">
        Anexe o XML da nota fiscal de remessa, a declaração de conteúdo ou os
        dois. O XML é conferido assim que enviado.
      </p>
      {props.errors.documents && (
        <span className="error">{props.errors.documents}</span>
      )}
      <DocumentSlot
        purpose="nota_xml"
        label="XML da nota fiscal"
        slot={props.invoiceXml}
        error={props.errors.invoiceXmlFileId}
        onSelect={(file) => props.onSelect('invoiceXml', file)}
        onRemove={() => props.onRemove('invoiceXml')}
      >
        {props.invoiceXml?.status === 'enviado' && (
          <InvoiceCheck check={props.invoiceCheck} />
        )}
      </DocumentSlot>
      <DocumentSlot
        purpose="declaracao"
        label="Declaração de conteúdo"
        slot={props.declaration}
        error={props.errors.declarationFileId}
        onSelect={(file) => props.onSelect('declaration', file)}
        onRemove={() => props.onRemove('declaration')}
      />
    </fieldset>
  );
}
