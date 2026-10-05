import type {
  CreateUploadSessionRequest,
  StoredFileView,
  UploadSessionCreated,
  UploadSessionView,
} from '@central/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { api, errorMessage, get, post } from '../../api/client';
import { Alert, FormAlert } from '../../components/feedback';
import { QrCode } from '../../components/QrCode';
import { formatDateTime } from '../../lib/format';
import { useModalDialog } from '../../components/use-modal-dialog';

const SESSIONS_PATH = '/upload-sessions';

/** Com o QR Code aberto, o computador confere o que chegou do celular. */
const SESSION_REFRESH_MS = 3_000;

/**
 * "Enviar pelo celular": gera um QR Code de validade curta. O celular abre a
 * página de envio sem login, e cada arquivo que chega é repassado em
 * `onFiles` (na abertura, entra no rascunho; na validação, já está anexado).
 */
export function MobileUploadButton(props: {
  label: string;
  request: CreateUploadSessionRequest;
  title: string;
  /** O que acontece com os arquivos, mostrado junto do código. */
  description: string;
  /** Texto ao terminar (ex.: o vídeo de validação já anexado). */
  doneMessage: string;
  onFiles: (files: StoredFileView[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useModalDialog(open);
  const seen = useRef(new Set<string>());
  const { onFiles } = props;

  const create = useMutation({
    mutationFn: () => post<UploadSessionCreated>(SESSIONS_PATH, props.request),
  });
  const session = create.data;
  const status = useQuery({
    queryKey: [SESSIONS_PATH, session?.id],
    queryFn: () => get<UploadSessionView>(`${SESSIONS_PATH}/${session?.id}`),
    enabled: open && Boolean(session),
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'aberta'
        ? false
        : SESSION_REFRESH_MS,
  });

  // Cada arquivo é repassado uma vez, mesmo com consultas repetidas.
  useEffect(() => {
    const fresh = (status.data?.files ?? []).filter(
      (file) => !seen.current.has(file.id),
    );
    if (fresh.length === 0) return;
    fresh.forEach((file) => seen.current.add(file.id));
    onFiles(fresh);
  }, [status.data, onFiles]);

  function start() {
    create.reset();
    create.mutate();
    setOpen(true);
  }

  /** Fechar invalida o link: um código esquecido na tela não serve depois. */
  function close() {
    if (session && status.data?.status === 'aberta') {
      void api('DELETE', `${SESSIONS_PATH}/${session.id}`).catch(() => {});
    }
    setOpen(false);
  }

  const current = status.data?.status ?? (session ? 'aberta' : null);
  const received = status.data?.files ?? [];
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={start}
      >
        <Smartphone size={16} aria-hidden />
        {props.label}
      </button>
      <dialog
        ref={ref}
        className="card dialog mobile-upload"
        onClose={close}
        aria-labelledby={`${id}-title`}
      >
        {open && (
          <>
            <h2 id={`${id}-title`}>{props.title}</h2>
            <p className="muted">{props.description}</p>
            <FormAlert message={errorMessage(create.error)} />
            {create.isPending && <p className="muted">Gerando o código…</p>}
            {session && current === 'aberta' && (
              <div className="mobile-upload-code">
                <QrCode
                  value={session.url}
                  label="QR Code para enviar pelo celular"
                />
                <p className="hint">
                  Aponte a câmera do celular para o código. Ele vale até{' '}
                  {formatDateTime(session.expiresAt)} e para de funcionar ao
                  fechar esta janela.
                </p>
              </div>
            )}
            {current === 'expirada' && (
              <div className="stack-sm">
                <Alert tone="warning">O código expirou.</Alert>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={start}
                >
                  <RefreshCw size={16} aria-hidden />
                  Gerar outro código
                </button>
              </div>
            )}
            {current === 'encerrada' && (
              <Alert tone="success">{props.doneMessage}</Alert>
            )}
            {received.length > 0 && (
              <div aria-live="polite">
                <span className="field-label">
                  Recebidos do celular ({received.length})
                </span>
                <ul className="review-list">
                  {received.map((file) => (
                    <li key={file.id}>{file.name}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
