import { z } from 'zod';
import { opaqueTokenSchema, uuidSchema } from './common.js';
import type { FilePurpose, StoredFileView } from './files.js';
import { PHOTOS_PER_ITEM } from './rma-opening.js';

/**
 * Envio pelo celular: o computador mostra um QR Code com um link de uso
 * restrito, e o celular envia fotos e vídeos direto para o lugar certo, sem
 * login e sem passar o arquivo por outro aplicativo (decisão de 01/10/2026).
 *
 * - `abertura`: fotos e vídeo da falha de um equipamento no formulário de
 *   abertura; chegam ao rascunho aberto no computador.
 * - `validacao`: vídeo de validação de um item; é anexado ao chamado assim
 *   que termina de chegar.
 */
export const UPLOAD_SESSION_KINDS = ['abertura', 'validacao'] as const;
export type UploadSessionKind = (typeof UPLOAD_SESSION_KINDS)[number];

/** Validade do QR Code: curta, porque o link dispensa login. */
export const UPLOAD_SESSION_TTL_MINUTES = 15;

export const MOBILE_UPLOAD_MEDIA = ['foto', 'video'] as const;
export type MobileUploadMedia = (typeof MOBILE_UPLOAD_MEDIA)[number];

/** Finalidade de cada mídia em cada tipo de sessão; `null` não é aceito. */
export const UPLOAD_SESSION_PURPOSES: Record<
  UploadSessionKind,
  Record<MobileUploadMedia, FilePurpose | null>
> = {
  abertura: { foto: 'foto_item', video: 'video_item' },
  validacao: { foto: null, video: 'video_validacao' },
};

export const createUploadSessionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('abertura'),
      /** Equipamento do rascunho, exibido no celular (ex.: "Equipamento 2"). */
      label: z.string().trim().min(1).max(120),
      photoLimit: z.int().min(0).max(PHOTOS_PER_ITEM.max),
      videoLimit: z.int().min(0).max(1),
    })
    .refine((value) => value.photoLimit + value.videoLimit > 0, {
      message: 'Este equipamento já tem todas as fotos e o vídeo',
      path: ['photoLimit'],
    }),
  z.object({
    kind: z.literal('validacao'),
    rmaNumber: z.int().positive(),
    itemId: uuidSchema,
  }),
]);
export type CreateUploadSessionRequest = z.infer<
  typeof createUploadSessionSchema
>;

/** O link (com o token) só é devolvido aqui, uma vez. */
export interface UploadSessionCreated {
  id: string;
  url: string;
  expiresAt: string;
}

export type UploadSessionStatus = 'aberta' | 'encerrada' | 'expirada';

/** Acompanhamento no computador, pela conta que gerou o QR Code. */
export interface UploadSessionView {
  id: string;
  status: UploadSessionStatus;
  expiresAt: string;
  files: StoredFileView[];
}

export const mobileUploadTokenSchema = z.object({ token: opaqueTokenSchema });
export type MobileUploadTokenRequest = z.infer<typeof mobileUploadTokenSchema>;

export const mobileUploadFileSchema = z.object({
  token: opaqueTokenSchema,
  media: z.enum(MOBILE_UPLOAD_MEDIA),
});
export type MobileUploadFileRequest = z.infer<typeof mobileUploadFileSchema>;

/** O que o celular vê: sem ids de conta nem de arquivo. */
export interface MobileUploadSessionView {
  kind: UploadSessionKind;
  /** Encerrada quando o vídeo de validação já foi anexado ao chamado. */
  status: UploadSessionStatus;
  /** Ex.: "Chamado #100004" ou "Novo atendimento". */
  title: string;
  /** Equipamento, ex.: "MB460 (S/N SIM-MB-000402)". */
  label: string;
  expiresAt: string;
  remaining: Record<MobileUploadMedia, number>;
  sent: { name: string; media: MobileUploadMedia }[];
}
