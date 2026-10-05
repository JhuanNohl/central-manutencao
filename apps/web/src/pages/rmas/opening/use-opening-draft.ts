import type { StoredFileView } from '@central/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allSlots,
  emptyItem,
  moveItem,
  newDraft,
  revokePreview,
  startUpload,
  withReceivedFiles,
  withSlot,
  type DraftItem,
  type OpeningDraft,
  type UploadSlot,
} from './draft';

export type DocumentKind = 'invoiceXml' | 'declaration';

const DOCUMENT_PURPOSE = {
  invoiceXml: 'nota_xml',
  declaration: 'declaracao',
} as const;

/** Ações sobre o rascunho; a mesma referência a cada render. */
export type OpeningActions = ReturnType<typeof createActions>;

/**
 * As ações só usam atualizações funcionais e a referência ao rascunho mais
 * recente: não mudam entre renders. Assim, com 200 equipamentos, editar um
 * deles redesenha só aquele item (ItemFields é memorizado).
 */
function createActions(
  setDraft: (change: (current: OpeningDraft) => OpeningDraft) => void,
  latest: { current: OpeningDraft },
  onReorder: { current: () => void },
) {
  const replaceSlot = (slot: UploadSlot) =>
    setDraft((current) => withSlot(current, slot));

  const mapItem = (key: string, change: (item: DraftItem) => DraftItem) =>
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === key ? change(item) : item,
      ),
    }));

  const updateItem = (key: string, change: Partial<DraftItem>) =>
    mapItem(key, (item) => ({ ...item, ...change }));

  return {
    updateItem,

    addPhotos(key: string, files: File[]) {
      const slots = files.map((file) =>
        startUpload('foto_item', file, replaceSlot),
      );
      mapItem(key, (item) => ({ ...item, photos: [...item.photos, ...slots] }));
    },

    removePhoto(key: string, slotKey: string) {
      const item = latest.current.items.find((current) => current.key === key);
      revokePreview(item?.photos.find((photo) => photo.key === slotKey));
      mapItem(key, (current) => ({
        ...current,
        photos: current.photos.filter((photo) => photo.key !== slotKey),
      }));
    },

    selectVideo(key: string, file: File) {
      updateItem(key, { video: startUpload('video_item', file, replaceSlot) });
    },

    /** O limite vale também aqui: fotos além de cinco ficam de fora. */
    receiveFiles(key: string, files: StoredFileView[]) {
      mapItem(key, (item) => withReceivedFiles(item, files));
    },

    addItems(count: number) {
      setDraft((current) => ({
        ...current,
        items: [
          ...current.items,
          ...Array.from({ length: count }, () => emptyItem()),
        ],
      }));
    },

    removeItem(key: string) {
      latest.current.items
        .find((item) => item.key === key)
        ?.photos.forEach(revokePreview);
      onReorder.current();
      setDraft((current) => ({
        ...current,
        items: current.items.filter((item) => item.key !== key),
      }));
    },

    move(index: number, offset: -1 | 1) {
      onReorder.current();
      setDraft((current) => ({
        ...current,
        items: moveItem(current.items, index, offset),
      }));
    },

    selectDocument(kind: DocumentKind, file: File) {
      const slot = startUpload(DOCUMENT_PURPOSE[kind], file, replaceSlot);
      setDraft((current) => ({ ...current, [kind]: slot }));
    },

    removeDocument(kind: DocumentKind) {
      setDraft((current) => ({ ...current, [kind]: null }));
    },
  };
}

/**
 * Rascunho da abertura: equipamentos, fotos, vídeos e documentos, com o
 * envio de cada arquivo começando assim que ele é escolhido. `onReorder` é
 * chamado quando a lista de equipamentos muda de posição (os erros são
 * indexados pela posição e deixam de valer).
 */
export function useOpeningDraft(onReorder: () => void) {
  const [draft, setDraft] = useState(newDraft);
  const latest = useRef(draft);
  const reorder = useRef(onReorder);

  // Miniaturas locais são liberadas ao sair da página.
  useEffect(() => {
    latest.current = draft;
    reorder.current = onReorder;
  });
  useEffect(() => () => allSlots(latest.current).forEach(revokePreview), []);

  const actions = useMemo(() => createActions(setDraft, latest, reorder), []);
  return { draft, actions };
}
