import { FILE_POLICIES, maxSizeLabel } from '@central/contracts';
import { Video, X } from 'lucide-react';
import { useId } from 'react';
import type { UploadSlot } from './draft';
import { UploadStatus } from './UploadStatus';

const POLICY = FILE_POLICIES.video_item;

/** Vídeo opcional da falha, enviado assim que escolhido, junto das fotos. */
export function VideoField(props: {
  itemLabel: string;
  video: UploadSlot | null;
  error?: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label">Vídeo da falha (opcional)</span>
      {props.video ? (
        <div className="document-row">
          <span className="strong">{props.video.name}</span>
          <UploadStatus slot={props.video} />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remover vídeo do ${props.itemLabel}`}
            onClick={props.onRemove}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <label className="btn btn-secondary btn-sm file-button">
          <Video size={16} aria-hidden />
          Adicionar vídeo
          <input
            type="file"
            accept={POLICY.extensions.join(',')}
            className="visually-hidden"
            aria-label={`Adicionar vídeo do ${props.itemLabel}`}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onSelect(file);
              e.target.value = '';
            }}
          />
        </label>
      )}
      <span id={`${id}-hint`} className="hint">
        MP4, MOV ou WebM de até {maxSizeLabel(POLICY)}. Um vídeo curto mostrando
        a falha acontecendo ajuda no diagnóstico.
      </span>
      {props.error && <span className="error">{props.error}</span>}
    </div>
  );
}
