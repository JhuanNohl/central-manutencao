import {
  DOCUMENTATION_PENDING_LABELS,
  DOCUMENTS_REQUIRED_MESSAGE,
  FILE_POLICIES,
  maxSizeLabel,
  type DocumentationPendingReason,
  type FilePurpose,
} from '@central/contracts';
import { useMutation } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, errorMessage, post, uploadFile } from '../../api/client';
import { FormAlert } from '../../components/feedback';
import { useModalDialog } from '../../components/use-modal-dialog';

function FileInput(props: {
  purpose: FilePurpose;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  const policy = FILE_POLICIES[props.purpose];
  return (
    <div className="field">
      <label htmlFor={id}>{policy.label} (opcional)</label>
      <input
        id={id}
        type="file"
        accept={policy.extensions.join(',')}
        onChange={(event) => props.onChange(event.target.files?.[0] ?? null)}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className="hint">
        {policy.extensions.join(', ')} de até {maxSizeLabel(policy)}.
      </span>
    </div>
  );
}

/**
 * Envio da documentação pendente depois da abertura (comum nos chamados do
 * sistema anterior). O XML passa pelas mesmas regras da abertura e substitui
 * a nota com divergências.
 */
export function SendDocumentsAction(props: {
  /** Rota da API (equipe ou portal). */
  path: string;
  pending: DocumentationPendingReason;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useModalDialog(open);
  const titleId = useId();
  const [xml, setXml] = useState<File | null>(null);
  const [declaration, setDeclaration] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: async () => {
      const [invoice, declarationFile] = await Promise.all([
        xml ? uploadFile('nota_xml', xml) : null,
        declaration ? uploadFile('declaracao', declaration) : null,
      ]);
      return post<void>(props.path, {
        invoiceXmlFileId: invoice?.id,
        declarationFileId: declarationFile?.id,
      });
    },
    onSuccess: () => {
      setOpen(false);
      props.onSent();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!xml && !declaration) {
      setLocalError(DOCUMENTS_REQUIRED_MESSAGE);
      return;
    }
    setLocalError(null);
    send.mutate();
  }

  function close() {
    setOpen(false);
    setXml(null);
    setDeclaration(null);
    setLocalError(null);
    send.reset();
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen(true)}
      >
        <FileUp size={18} aria-hidden />
        Enviar documentação
      </button>
      <dialog
        ref={ref}
        className="card dialog"
        onClose={close}
        aria-labelledby={titleId}
      >
        {open && (
          <form onSubmit={onSubmit} noValidate>
            <h2 id={titleId}>Enviar documentação</h2>
            <p className="muted">
              {DOCUMENTATION_PENDING_LABELS[props.pending]}. Anexe o XML da nota
              fiscal de remessa ou a declaração de conteúdo.
            </p>
            <FileInput purpose="nota_xml" onChange={setXml} />
            <FileInput purpose="declaracao" onChange={setDeclaration} />
            <FormAlert message={localError ?? errorMessage(send.error)} />
            {send.error instanceof ApiError && send.error.issues.length > 0 && (
              <ul className="issue-list">
                {send.error.issues.map((issue) => (
                  <li key={issue.message}>{issue.message}</li>
                ))}
              </ul>
            )}
            <div className="actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={send.isPending}
              >
                {send.isPending ? 'Enviando…' : 'Enviar'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
