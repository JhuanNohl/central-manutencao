import type { StoredFileView } from '@central/contracts';

/** Miniaturas das fotos do equipamento; cada uma abre o arquivo original. */
export function ItemPhotos(props: {
  photos: StoredFileView[];
  model: string;
  fileUrl: (fileId: string) => string;
}) {
  if (props.photos.length === 0) return null;
  return (
    <ul className="thumbs" aria-label={`Fotos do ${props.model}`}>
      {props.photos.map((photo, index) => (
        <li key={photo.id}>
          <a href={props.fileUrl(photo.id)} target="_blank" rel="noreferrer">
            <img
              src={props.fileUrl(photo.id)}
              alt={`Foto ${index + 1} de ${props.photos.length} do ${props.model}`}
              loading="lazy"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
