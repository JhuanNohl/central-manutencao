import { isVideoFile, type StoredFileView } from '@central/contracts';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { useId, type KeyboardEvent } from 'react';
import { useModalDialog } from '../../components/use-modal-dialog';

export interface MediaEntry {
  file: StoredFileView;
  /** Ex.: "Foto 2" ou "Vídeo da falha". */
  label: string;
}

/**
 * Carrossel das fotos e do vídeo de um equipamento. As setas (na tela ou no
 * teclado) trocam o arquivo sem fechar; do último, volta ao primeiro.
 */
export function MediaViewer(props: {
  title: string;
  media: MediaEntry[];
  /** Arquivo aberto; `null` fecha o carrossel. */
  index: number | null;
  fileUrl: (fileId: string) => string;
  onChange: (index: number | null) => void;
}) {
  const id = useId();
  const open = props.index !== null;
  const ref = useModalDialog(open);

  const count = props.media.length;
  const index = props.index ?? 0;
  const current = props.media[index];
  const go = (offset: -1 | 1) =>
    props.onChange((index + offset + count) % count);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    // No reprodutor, as setas avançam o vídeo.
    if (event.target instanceof HTMLVideoElement || count < 2) return;
    if (event.key === 'ArrowLeft') go(-1);
    if (event.key === 'ArrowRight') go(1);
  }

  return (
    <dialog
      ref={ref}
      className="card dialog media-viewer"
      onClose={() => props.onChange(null)}
      onKeyDown={onKeyDown}
      aria-labelledby={`${id}-title`}
    >
      {open && current && (
        <>
          <header className="media-viewer-header">
            <div>
              <h2 id={`${id}-title`}>{props.title}</h2>
              <span className="muted" aria-live="polite">
                {current.label} · {index + 1} de {count}
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Fechar"
              onClick={() => props.onChange(null)}
            >
              <X size={20} aria-hidden />
            </button>
          </header>
          <div className="media-stage">
            {count > 1 && (
              <button
                type="button"
                className="icon-button media-nav"
                aria-label="Anterior"
                onClick={() => go(-1)}
              >
                <ChevronLeft size={28} aria-hidden />
              </button>
            )}
            {isVideoFile(current.file) ? (
              <video
                key={current.file.id}
                className="media-content"
                src={props.fileUrl(current.file.id)}
                controls
                preload="metadata"
              />
            ) : (
              <img
                key={current.file.id}
                className="media-content"
                src={props.fileUrl(current.file.id)}
                alt={`${current.label} de ${count} do ${props.title}`}
              />
            )}
            {count > 1 && (
              <button
                type="button"
                className="icon-button media-nav"
                aria-label="Próxima"
                onClick={() => go(1)}
              >
                <ChevronRight size={28} aria-hidden />
              </button>
            )}
          </div>
          <a
            href={props.fileUrl(current.file.id)}
            target="_blank"
            rel="noreferrer"
            className="more-link"
          >
            Abrir em nova aba
            <ExternalLink size={16} aria-hidden />
          </a>
        </>
      )}
    </dialog>
  );
}
