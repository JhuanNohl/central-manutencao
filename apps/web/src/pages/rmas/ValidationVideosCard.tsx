import {
  FILE_POLICIES,
  VALIDATION_VIDEO_STAGES,
  type RmaItemStage,
  type StoredFileView,
  type ValidationVideoView,
} from '@central/contracts';
import { LoaderCircle, Upload, Video, VideoOff } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, put, uploadFile } from '../../api/client';
import { Badge, type StatusStyle } from '../../components/Badge';
import { InlineError } from '../../components/feedback';
import { formatDateTime } from '../../lib/format';
import { precheckFile } from './opening/draft';
import { useRmaOperation } from './rma-operations';
import { RMAS_PATH } from './RmasPage';

const POLICY = FILE_POLICIES.video_validacao;

const VIDEO_STATUS: Record<'gravado' | 'pendente', StatusStyle> = {
  gravado: { label: 'Vídeo gravado', tone: 'success', icon: Video },
  pendente: { label: 'Aguardando vídeo', tone: 'warning', icon: VideoOff },
};

/** No portal, o vídeo vem sem a conta de quem gravou (RN11). */
interface ValidationItem {
  id: string;
  position: number;
  model: string;
  serialNumber: string;
  stage: RmaItemStage;
  validationVideo:
    | (Omit<ValidationVideoView, 'recordedBy'> &
        Partial<Pick<ValidationVideoView, 'recordedBy'>>)
    | null;
}

function recordedLine(video: NonNullable<ValidationItem['validationVideo']>) {
  const by = video.recordedBy ? ` por ${video.recordedBy.name}` : '';
  return `Gravado em ${formatDateTime(video.recordedAt)}${by}`;
}

/** Envia o vídeo e o vincula ao item; um novo substitui o anterior. */
function AttachVideoButton(props: { number: number; item: ValidationItem }) {
  const [problem, setProblem] = useState<string | null>(null);
  const attach = useRmaOperation(async (file: File) => {
    const stored: StoredFileView = await uploadFile('video_validacao', file);
    return put<ValidationVideoView>(
      `${RMAS_PATH}/${props.number}/items/${props.item.id}/validation-video`,
      { fileId: stored.id },
    );
  });
  return (
    <div className="actions">
      <label
        className="btn btn-secondary btn-sm file-button"
        aria-disabled={attach.isPending}
      >
        <Upload size={16} aria-hidden />
        {props.item.validationVideo ? 'Substituir vídeo' : 'Anexar vídeo'}
        <input
          type="file"
          accept={POLICY.extensions.join(',')}
          className="visually-hidden"
          disabled={attach.isPending}
          aria-label={`Anexar vídeo de validação do ${props.item.model}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const error = precheckFile('video_validacao', file);
            setProblem(error);
            if (!error) attach.mutate(file);
          }}
        />
      </label>
      {attach.isPending && (
        <span className="upload-status" role="status">
          <LoaderCircle size={16} aria-hidden />
          Enviando…
        </span>
      )}
      <InlineError message={problem ?? errorMessage(attach.error)} />
    </div>
  );
}

/**
 * Vídeo do equipamento funcionando, gravado pela equipe nas etapas finais e
 * exigido para o despacho. Fica separado das fotos e do vídeo da falha, que
 * vêm da abertura.
 */
export function ValidationVideosCard(props: {
  number: number;
  items: ValidationItem[];
  fileUrl: (fileId: string) => string;
  /** Equipe com permissão de operar um chamado aberto. */
  canAttach: boolean;
  description: string;
  emptyMessage: string;
}) {
  const recordable = (item: ValidationItem) =>
    props.canAttach && VALIDATION_VIDEO_STAGES.includes(item.stage);
  const items = props.items.filter(
    (item) => item.validationVideo || recordable(item),
  );

  return (
    <section className="card">
      <h2 className="card-title-icon">
        <Video size={20} aria-hidden className="inline-icon" />
        Vídeo de validação
      </h2>
      <p className="muted">{props.description}</p>
      {items.length === 0 ? (
        <p className="muted">{props.emptyMessage}</p>
      ) : (
        <ul className="validation-list">
          {items.map((item) => (
            <li key={item.id} className="validation-row">
              <div className="validation-head">
                <div>
                  <span className="strong">
                    {item.position}. {item.model}
                  </span>
                  <span className="sub">S/N {item.serialNumber}</span>
                </div>
                <Badge
                  status={
                    VIDEO_STATUS[item.validationVideo ? 'gravado' : 'pendente']
                  }
                />
              </div>
              {item.validationVideo && (
                <>
                  <video
                    className="validation-video"
                    src={props.fileUrl(item.validationVideo.file.id)}
                    controls
                    preload="metadata"
                    aria-label={`Vídeo de validação do ${item.model}`}
                  />
                  <span className="sub">
                    {recordedLine(item.validationVideo)}
                  </span>
                </>
              )}
              {recordable(item) && (
                <AttachVideoButton number={props.number} item={item} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
