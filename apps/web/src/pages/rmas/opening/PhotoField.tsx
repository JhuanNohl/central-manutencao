import { FILE_POLICIES, PHOTOS_PER_ITEM } from '@central/contracts';
import { ImagePlus, X } from 'lucide-react';
import { useId } from 'react';
import type { UploadSlot } from './draft';
import { UploadStatus } from './UploadStatus';

const POLICY = FILE_POLICIES.foto_item;

/** Fotos de um equipamento: de 1 a 5, enviadas assim que escolhidas. */
export function PhotoField(props: {
  itemLabel: string;
  photos: UploadSlot[];
  error?: string;
  onAdd: (files: File[]) => void;
  onRemove: (slotKey: string) => void;
}) {
  const id = useId();
  const remaining = PHOTOS_PER_ITEM.max - props.photos.length;
  return (
    <div className="field">
      <span className="field-label" id={`${id}-label`}>
        Fotos ({props.photos.length} de {PHOTOS_PER_ITEM.max})
      </span>
      {props.photos.length > 0 && (
        <ul className="upload-grid" aria-labelledby={`${id}-label`}>
          {props.photos.map((photo, index) => (
            <li key={photo.key} className="upload-tile">
              {photo.previewUrl ? (
                <img src={photo.previewUrl} alt="" />
              ) : (
                <span className="upload-placeholder" aria-hidden />
              )}
              <span className="upload-name">{photo.name}</span>
              <UploadStatus slot={photo} />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover foto ${index + 1} do ${props.itemLabel}`}
                onClick={() => props.onRemove(photo.key)}
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <label className="btn btn-secondary btn-sm file-button">
          <ImagePlus size={16} aria-hidden />
          Adicionar fotos
          <input
            type="file"
            accept={POLICY.extensions.join(',')}
            multiple
            className="visually-hidden"
            aria-label={`Adicionar fotos do ${props.itemLabel}`}
            aria-describedby={
              props.error ? `${id}-hint ${id}-error` : `${id}-hint`
            }
            onChange={(e) => {
              props.onAdd([...(e.target.files ?? [])].slice(0, remaining));
              e.target.value = '';
            }}
          />
        </label>
      )}
      <span id={`${id}-hint`} className="hint">
        JPG, PNG ou WebP de até {POLICY.maxBytes / (1024 * 1024)} MB. Mostre o
        equipamento, a etiqueta com o número de série e o defeito, se visível.
      </span>
      {props.error && (
        <span id={`${id}-error`} className="error">
          {props.error}
        </span>
      )}
    </div>
  );
}
