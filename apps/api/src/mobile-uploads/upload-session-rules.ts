import {
  hasPermission,
  UPLOAD_SESSION_PURPOSES,
  type FilePurpose,
  type MobileUploadMedia,
  type Permission,
  type Role,
  type UploadSessionKind,
  type UploadSessionStatus,
} from '@central/contracts';

interface SessionState {
  kind: UploadSessionKind;
  photoLimit: number;
  videoLimit: number;
  expiresAt: Date;
  closedAt: Date | null;
}

/**
 * A conta que gerou o código precisa continuar podendo fazer o envio: um
 * papel alterado ou uma conta desativada invalidam o QR Code na hora.
 */
const OWNER_PERMISSIONS: Record<UploadSessionKind, Permission[]> = {
  abertura: ['rma.own.create', 'rma.write'],
  validacao: ['rma.write'],
};

export function ownerMayUpload(
  kind: UploadSessionKind,
  owner: { role: Role; status: string } | undefined,
): boolean {
  return (
    owner?.status === 'ativa' &&
    OWNER_PERMISSIONS[kind].some((permission) =>
      hasPermission(owner.role, permission),
    )
  );
}

export function sessionStatus(
  session: SessionState,
  now: Date,
): UploadSessionStatus {
  if (session.closedAt) return 'encerrada';
  return session.expiresAt <= now ? 'expirada' : 'aberta';
}

export function mediaOf(
  kind: UploadSessionKind,
  file: { purpose: FilePurpose },
): MobileUploadMedia {
  return UPLOAD_SESSION_PURPOSES[kind].foto === file.purpose ? 'foto' : 'video';
}

/** Quanto ainda cabe de cada mídia, pelos limites gravados na sessão. */
export function remainingOf(
  session: SessionState,
  sent: { purpose: FilePurpose }[],
): Record<MobileUploadMedia, number> {
  const count = (media: MobileUploadMedia) =>
    sent.filter((file) => mediaOf(session.kind, file) === media).length;
  return {
    foto: Math.max(session.photoLimit - count('foto'), 0),
    video: Math.max(session.videoLimit - count('video'), 0),
  };
}
