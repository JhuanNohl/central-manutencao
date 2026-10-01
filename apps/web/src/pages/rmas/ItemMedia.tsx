import { isVideoFile, type StoredFileView } from '@central/contracts';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { MediaViewer, type MediaEntry } from './MediaViewer';

/**
 * Miniaturas das fotos e do vídeo da falha de um equipamento. Cada uma abre
 * o carrossel naquele arquivo.
 */
export function ItemMedia(props: {
  photos: StoredFileView[];
  video: StoredFileView | null;
  model: string;
  fileUrl: (fileId: string) => string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const media: MediaEntry[] = [
    ...props.photos.map((file, index) => ({
      file,
      label: `Foto ${index + 1}`,
    })),
    ...(props.video ? [{ file: props.video, label: 'Vídeo da falha' }] : []),
  ];
  if (media.length === 0) return null;

  return (
    <>
      <ul className="thumbs" aria-label={`Fotos e vídeo do ${props.model}`}>
        {media.map((entry, index) => (
          <li key={entry.file.id}>
            <button
              type="button"
              className="thumb-button"
              aria-label={`Abrir ${entry.label.toLowerCase()} do ${props.model}`}
              onClick={() => setOpen(index)}
            >
              {isVideoFile(entry.file) ? (
                <span className="thumb-video">
                  <Play size={20} aria-hidden />
                  Vídeo
                </span>
              ) : (
                <img src={props.fileUrl(entry.file.id)} alt="" loading="lazy" />
              )}
            </button>
          </li>
        ))}
      </ul>
      <MediaViewer
        title={props.model}
        media={media}
        index={open}
        fileUrl={props.fileUrl}
        onChange={setOpen}
      />
    </>
  );
}
