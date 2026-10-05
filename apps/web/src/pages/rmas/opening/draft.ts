import {
  FILE_POLICIES,
  PHOTOS_PER_ITEM,
  type StoredFileView,
  type FilePurpose,
  type OpeningContent,
  maxSizeLabel,
} from '@central/contracts';
import { ApiError, errorMessage, uploadFile } from '../../../api/client';

/** Arquivo escolhido no formulário e o andamento do envio. */
export interface UploadSlot {
  key: string;
  name: string;
  status: 'enviando' | 'enviado' | 'erro';
  fileId?: string;
  error?: string;
  /** Miniatura local das fotos, antes mesmo do envio terminar. */
  previewUrl?: string;
}

/**
 * Equipamento em edição. A chave é estável: as fotos seguem o item quando
 * ele é reordenado ou quando outro item é removido (S2-03).
 */
export interface DraftItem {
  key: string;
  model: string;
  serialNumber: string;
  reportedFailure: string;
  notes: string;
  warrantyRequested: boolean;
  photos: UploadSlot[];
  video: UploadSlot | null;
}

export interface OpeningDraft {
  /** Mesma chave em todas as tentativas deste formulário (CA16). */
  openingKey: string;
  items: DraftItem[];
  invoiceXml: UploadSlot | null;
  declaration: UploadSlot | null;
}

export const emptyItem = (): DraftItem => ({
  key: crypto.randomUUID(),
  model: '',
  serialNumber: '',
  reportedFailure: '',
  notes: '',
  warrantyRequested: false,
  photos: [],
  video: null,
});

export const newDraft = (): OpeningDraft => ({
  openingKey: crypto.randomUUID(),
  items: [emptyItem()],
  invoiceXml: null,
  declaration: null,
});

export function moveItem(
  items: DraftItem[],
  index: number,
  offset: -1 | 1,
): DraftItem[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Conferência imediata de extensão e tamanho; o servidor confere o conteúdo. */
export function precheckFile(purpose: FilePurpose, file: File): string | null {
  const policy = FILE_POLICIES[purpose];
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!policy.extensions.includes(extension)) {
    return `Envie um arquivo ${policy.extensions.join(', ')}.`;
  }
  if (file.size > policy.maxBytes) {
    return `O arquivo passa de ${maxSizeLabel(policy)}.`;
  }
  return null;
}

/** O motivo vem no campo `file` (ex.: conteúdo que não é imagem). */
function uploadError(error: unknown): string | undefined {
  const issue = error instanceof ApiError ? error.issues[0] : undefined;
  return issue?.message ?? errorMessage(error) ?? undefined;
}

/**
 * Inicia o envio e devolve o estado inicial. `onSettled` recebe o estado
 * final (enviado ou erro) com a mesma chave, para o formulário substituir.
 */
export function startUpload(
  purpose: FilePurpose,
  file: File,
  onSettled: (slot: UploadSlot) => void,
): UploadSlot {
  const base = { key: crypto.randomUUID(), name: file.name };
  const problem = precheckFile(purpose, file);
  if (problem) return { ...base, status: 'erro', error: problem };

  const slot: UploadSlot = {
    ...base,
    status: 'enviando',
    previewUrl: purpose === 'foto_item' ? URL.createObjectURL(file) : undefined,
  };
  uploadFile(purpose, file).then(
    (stored) => onSettled({ ...slot, status: 'enviado', fileId: stored.id }),
    (error: unknown) =>
      onSettled({ ...slot, status: 'erro', error: uploadError(error) }),
  );
  return slot;
}

/** Troca um arquivo pelo estado final do envio, onde quer que ele esteja. */
export function withSlot(draft: OpeningDraft, slot: UploadSlot): OpeningDraft {
  const pick = (current: UploadSlot | null) =>
    current?.key === slot.key ? slot : current;
  return {
    ...draft,
    items: draft.items.map((item) => ({
      ...item,
      photos: item.photos.map((photo) =>
        photo.key === slot.key ? slot : photo,
      ),
      video: pick(item.video),
    })),
    invoiceXml: pick(draft.invoiceXml),
    declaration: pick(draft.declaration),
  };
}

/** Só as miniaturas locais são liberadas; as vindas do celular são da API. */
export function revokePreview(slot: UploadSlot | null | undefined) {
  if (slot?.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(slot.previewUrl);
  }
}

/** Arquivo que chegou do celular: já enviado, com a miniatura da API. */
function receivedSlot(file: StoredFileView): UploadSlot {
  return {
    key: crypto.randomUUID(),
    name: file.name,
    status: 'enviado',
    fileId: file.id,
    previewUrl:
      file.purpose === 'foto_item' ? `/api/files/${file.id}` : undefined,
  };
}

/**
 * Junta ao equipamento o que chegou do celular. O limite vale também aqui:
 * fotos além do máximo e um segundo vídeo ficam de fora.
 */
export function withReceivedFiles(
  item: DraftItem,
  files: StoredFileView[],
): DraftItem {
  const photos = files.filter((file) => file.purpose === 'foto_item');
  const video = files.find((file) => file.purpose === 'video_item');
  return {
    ...item,
    photos: [...item.photos, ...photos.map(receivedSlot)].slice(
      0,
      PHOTOS_PER_ITEM.max,
    ),
    video: video && !item.video ? receivedSlot(video) : item.video,
  };
}

export function allSlots(draft: OpeningDraft): UploadSlot[] {
  return [
    ...draft.items.flatMap((item) => [
      ...item.photos,
      ...(item.video ? [item.video] : []),
    ]),
    ...(draft.invoiceXml ? [draft.invoiceXml] : []),
    ...(draft.declaration ? [draft.declaration] : []),
  ];
}

const sentId = (slot: UploadSlot | null) =>
  slot?.status === 'enviado' ? slot.fileId : undefined;

/** Corpo da abertura no formato do contrato; só arquivos já enviados entram. */
export function toOpeningInput(draft: OpeningDraft): OpeningContent {
  return {
    openingKey: draft.openingKey,
    items: draft.items.map((item) => ({
      model: item.model,
      serialNumber: item.serialNumber,
      reportedFailure: item.reportedFailure,
      notes: item.notes,
      warrantyRequested: item.warrantyRequested,
      photoIds: item.photos.flatMap((photo) =>
        photo.status === 'enviado' && photo.fileId ? [photo.fileId] : [],
      ),
      videoId: sentId(item.video),
    })),
    invoiceXmlFileId: sentId(draft.invoiceXml),
    declarationFileId: sentId(draft.declaration),
  };
}
