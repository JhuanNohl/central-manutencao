import {
  FILE_POLICIES,
  UPLOAD_SESSION_PURPOSES,
  type MobileUploadMedia,
  type MobileUploadSessionView,
} from '@central/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Images, Video } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api, errorMessage, post } from '../../api/client';
import { Alert, Loading, QueryError } from '../../components/feedback';
import { AuthLayout } from '../../layouts/AuthLayout';
import { formatDateTime } from '../../lib/format';
import { useLinkToken } from '../../lib/token';
import { precheckFile, type UploadSlot } from '../rmas/opening/draft';
import { UploadStatus } from '../rmas/opening/UploadStatus';

const SESSION_KEY = 'mobile-upload';

/** Tipos aceitos por mídia; no iPhone, a foto da câmera chega em JPEG. */
const ACCEPT: Record<MobileUploadMedia, string> = {
  foto: FILE_POLICIES.foto_item.contentTypes.join(','),
  video: FILE_POLICIES.video_item.contentTypes.join(','),
};

const MEDIA_LABELS: Record<MobileUploadMedia, [string, string]> = {
  foto: ['foto', 'fotos'],
  video: ['vídeo', 'vídeos'],
};

function countLabel(media: MobileUploadMedia, count: number): string {
  const [one, many] = MEDIA_LABELS[media];
  return `${count} ${count === 1 ? one : many}`;
}

/** Botão de arquivo grande, para o polegar: câmera ou galeria. */
function PickButton(props: {
  icon: ReactNode;
  label: string;
  media: MobileUploadMedia;
  capture?: boolean;
  multiple?: boolean;
  primary?: boolean;
  disabled: boolean;
  onPick: (files: File[]) => void;
}) {
  return (
    <label
      className={`btn btn-block file-button ${props.primary ? 'btn-primary' : 'btn-secondary'}`}
      aria-disabled={props.disabled}
    >
      {props.icon}
      {props.label}
      <input
        type="file"
        accept={ACCEPT[props.media]}
        capture={props.capture ? 'environment' : undefined}
        multiple={props.multiple}
        disabled={props.disabled}
        className="visually-hidden"
        onChange={(e) => {
          props.onPick([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </label>
  );
}

/**
 * Página aberta pelo QR Code no celular, sem login: o token do link limita
 * o envio ao equipamento escolhido no computador, por pouco tempo.
 */
export function MobileUploadPage() {
  const token = useLinkToken();
  const client = useQueryClient();
  const [uploads, setUploads] = useState<UploadSlot[]>([]);
  const session = useQuery({
    queryKey: [SESSION_KEY, token],
    queryFn: () =>
      post<MobileUploadSessionView>('/mobile-uploads/session', { token }),
    enabled: Boolean(token),
  });

  const send = useMutation({
    mutationFn: async ({
      media,
      file,
    }: {
      media: MobileUploadMedia;
      file: File;
    }) => {
      const form = new FormData();
      form.set('token', token ?? '');
      form.set('media', media);
      form.set('file', file);
      return api<MobileUploadSessionView>(
        'POST',
        '/mobile-uploads/files',
        form,
      );
    },
  });

  function update(key: string, change: Partial<UploadSlot>) {
    setUploads((current) =>
      current.map((slot) => (slot.key === key ? { ...slot, ...change } : slot)),
    );
  }

  /** Um envio por vez: cada resposta traz o saldo atualizado da sessão. */
  async function pick(media: MobileUploadMedia, files: File[]) {
    const view = session.data;
    if (!view) return;
    const purpose = UPLOAD_SESSION_PURPOSES[view.kind][media];
    const chosen = files.slice(0, view.remaining[media]);
    const slots = chosen.map((file) => ({
      key: crypto.randomUUID(),
      name: file.name,
      status: 'enviando' as const,
    }));
    setUploads((current) => [...current, ...slots]);
    for (const [index, file] of chosen.entries()) {
      const { key } = slots[index];
      const problem = purpose ? precheckFile(purpose, file) : null;
      if (problem) {
        update(key, { status: 'erro', error: problem });
        continue;
      }
      try {
        const fresh = await send.mutateAsync({ media, file });
        client.setQueryData([SESSION_KEY, token], fresh);
        update(key, { status: 'enviado' });
      } catch (error) {
        update(key, {
          status: 'erro',
          error: errorMessage(error) ?? undefined,
        });
      }
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Envio pelo celular">
        <Alert tone="error">
          Abra esta página pelo QR Code mostrado no computador.
        </Alert>
      </AuthLayout>
    );
  }
  if (session.isPending) return <Loading />;
  if (session.isError) {
    return (
      <AuthLayout title="Envio pelo celular">
        <QueryError error={session.error} />
      </AuthLayout>
    );
  }

  const view = session.data;
  const busy = send.isPending;
  const pending = (['foto', 'video'] as const).filter(
    (media) => view.remaining[media] > 0,
  );
  return (
    <AuthLayout
      title={`${view.title} · ${view.label}`}
      lead={
        view.status === 'aberta'
          ? `Válido até ${formatDateTime(view.expiresAt)}.`
          : undefined
      }
    >
      <div className="stack">
        {view.status === 'encerrada' ? (
          <Alert tone="success">
            Vídeo anexado ao chamado. Você já pode fechar esta página.
          </Alert>
        ) : pending.length === 0 ? (
          <Alert tone="success">
            Tudo enviado. Confira os arquivos no computador.
          </Alert>
        ) : (
          <p className="muted">
            Ainda dá para enviar{' '}
            {pending
              .map((media) => countLabel(media, view.remaining[media]))
              .join(' e ')}
            . Os arquivos aparecem no computador assim que terminam de enviar.
          </p>
        )}
        {view.remaining.foto > 0 && (
          <div className="stack-sm">
            <PickButton
              icon={<Camera size={20} aria-hidden />}
              label="Tirar foto"
              media="foto"
              capture
              primary
              disabled={busy}
              onPick={(files) => void pick('foto', files)}
            />
            <PickButton
              icon={<Images size={20} aria-hidden />}
              label="Escolher da galeria"
              media="foto"
              multiple
              disabled={busy}
              onPick={(files) => void pick('foto', files)}
            />
          </div>
        )}
        {view.remaining.video > 0 && (
          <div className="stack-sm">
            <PickButton
              icon={<Video size={20} aria-hidden />}
              label="Gravar vídeo"
              media="video"
              capture
              primary={view.remaining.foto === 0}
              disabled={busy}
              onPick={(files) => void pick('video', files)}
            />
            <PickButton
              icon={<Images size={20} aria-hidden />}
              label="Escolher vídeo da galeria"
              media="video"
              disabled={busy}
              onPick={(files) => void pick('video', files)}
            />
          </div>
        )}
        {uploads.length > 0 && (
          <ul className="review-list" aria-live="polite">
            {uploads.map((slot) => (
              <li key={slot.key} className="document-row">
                <span className="strong">{slot.name}</span>
                <UploadStatus slot={slot} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AuthLayout>
  );
}
