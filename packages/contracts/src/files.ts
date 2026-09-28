import { z } from 'zod';

/**
 * Finalidade de um arquivo enviado. Define os tipos aceitos, o tamanho e
 * onde ele pode ser vinculado; um arquivo só serve à finalidade declarada.
 */
export const FILE_PURPOSES = ['foto_item', 'nota_xml', 'declaracao'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

/** Tipos reconhecidos pelo conteúdo do arquivo, não pelo nome ou cabeçalho. */
export const FILE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/xml',
] as const;
export type FileContentType = (typeof FILE_CONTENT_TYPES)[number];

const MEGABYTE = 1024 * 1024;

export interface FilePolicy {
  label: string;
  contentTypes: readonly FileContentType[];
  maxBytes: number;
  /** Extensões aceitas, também usadas no seletor de arquivos do navegador. */
  extensions: readonly string[];
}

/** Limites da P05 (proposta de 28/09/2026). */
export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
  foto_item: {
    label: 'Foto do equipamento',
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * MEGABYTE,
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  nota_xml: {
    label: 'XML da nota fiscal',
    contentTypes: ['application/xml'],
    maxBytes: 1 * MEGABYTE,
    extensions: ['.xml'],
  },
  declaracao: {
    label: 'Declaração de conteúdo',
    contentTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    maxBytes: 10 * MEGABYTE,
    extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
  },
};

/** Maior tamanho aceito entre as finalidades (limite do recebimento HTTP). */
export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(FILE_POLICIES).map((policy) => policy.maxBytes),
);

export const FILE_NAME_MAX_LENGTH = 200;

export const uploadFileSchema = z.object({ purpose: z.enum(FILE_PURPOSES) });
export type UploadFileRequest = z.infer<typeof uploadFileSchema>;

export interface StoredFileView {
  id: string;
  purpose: FilePurpose;
  name: string;
  contentType: FileContentType;
  sizeBytes: number;
}
