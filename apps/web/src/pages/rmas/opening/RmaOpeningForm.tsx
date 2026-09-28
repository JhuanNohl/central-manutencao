import {
  MAX_ITEMS_PER_RMA,
  openOwnRmaSchema,
  type OpenOwnRmaRequest,
  type OpenRmaResponse,
} from '@central/contracts';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { ApiError, errorMessage } from '../../../api/client';
import { FormAlert } from '../../../components/feedback';
import { SubmitButton } from '../../../components/ui';
import {
  issuesToErrors,
  zodErrors,
  type FieldErrors,
} from '../../../lib/forms';
import { DocumentsFields } from './DocumentsFields';
import {
  allSlots,
  emptyItem,
  moveItem,
  newDraft,
  startUpload,
  toOpeningInput,
  type DraftItem,
  type OpeningDraft,
  type UploadSlot,
} from './draft';
import { useInvoiceValidation } from './invoice-validation';
import { ItemFields } from './ItemFields';
import { OpeningReview } from './OpeningReview';

type DocumentKind = 'invoiceXml' | 'declaration';

const DOCUMENT_PURPOSE = {
  invoiceXml: 'nota_xml',
  declaration: 'declaracao',
} as const;

function revokePreview(slot: UploadSlot | null | undefined) {
  if (slot?.previewUrl) URL.revokeObjectURL(slot.previewUrl);
}

/** Troca um arquivo pelo estado final do envio, onde quer que ele esteja. */
function withSlot(draft: OpeningDraft, slot: UploadSlot): OpeningDraft {
  const pick = (current: UploadSlot | null) =>
    current?.key === slot.key ? slot : current;
  return {
    ...draft,
    items: draft.items.map((item) => ({
      ...item,
      photos: item.photos.map((photo) =>
        photo.key === slot.key ? slot : photo,
      ),
    })),
    invoiceXml: pick(draft.invoiceXml),
    declaration: pick(draft.declaration),
  };
}

/**
 * Abertura de RMA com vários equipamentos, fotos e documentação (RF03–RF05).
 * Os dados ficam no rascunho em qualquer erro; a confirmação vem depois de
 * uma revisão. Usado pelo portal e pela equipe (que escolhe o cliente fora).
 */
export function RmaOpeningForm(props: {
  /** Cliente escolhido pela equipe; no portal, vale o próprio cadastro. */
  customerId?: string;
  /** Impede a revisão enquanto falta algo fora do formulário. */
  blockedReason?: string | null;
  /** Cliente e solicitante exibidos na revisão (equipe). */
  customerSummary?: ReactNode;
  submit: (input: OpenOwnRmaRequest) => Promise<OpenRmaResponse>;
  onOpened: (number: number) => void;
}) {
  const [draft, setDraft] = useState(newDraft);
  const [ready, setReady] = useState<OpenOwnRmaRequest | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const latest = useRef(draft);

  const xml = draft.invoiceXml;
  const xmlFileId = xml?.status === 'enviado' ? xml.fileId : undefined;
  const invoiceCheck = useInvoiceValidation(
    xmlFileId,
    props.customerId,
    !props.blockedReason,
  );

  const open = useMutation({
    mutationFn: props.submit,
    onSuccess: (result) => props.onOpened(result.number),
    onError: (error) => {
      setErrors(error instanceof ApiError ? issuesToErrors(error.issues) : {});
      setFormError(errorMessage(error));
      showStage(null);
    },
  });

  // Miniaturas locais são liberadas ao sair da página.
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  useEffect(() => () => allSlots(latest.current).forEach(revokePreview), []);

  function showStage(next: OpenOwnRmaRequest | null) {
    setReady(next);
    top.current?.scrollIntoView({ block: 'start' });
  }

  const replaceSlot = (slot: UploadSlot) =>
    setDraft((current) => withSlot(current, slot));

  function updateItem(key: string, change: Partial<DraftItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === key ? { ...item, ...change } : item,
      ),
    }));
  }

  function addPhotos(key: string, files: File[]) {
    const slots = files.map((file) =>
      startUpload('foto_item', file, replaceSlot),
    );
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === key
          ? { ...item, photos: [...item.photos, ...slots] }
          : item,
      ),
    }));
  }

  function removePhoto(key: string, slotKey: string) {
    const item = draft.items.find((current) => current.key === key);
    revokePreview(item?.photos.find((photo) => photo.key === slotKey));
    updateItem(key, {
      photos: item?.photos.filter((photo) => photo.key !== slotKey) ?? [],
    });
  }

  function removeItem(key: string) {
    draft.items.find((item) => item.key === key)?.photos.forEach(revokePreview);
    // Os erros são indexados pela posição: deixam de valer ao mudar a lista.
    setErrors({});
    setDraft((current) => ({
      ...current,
      items: current.items.filter((item) => item.key !== key),
    }));
  }

  function move(index: number, offset: -1 | 1) {
    setErrors({});
    setDraft((current) => ({
      ...current,
      items: moveItem(current.items, index, offset),
    }));
  }

  function selectDocument(kind: DocumentKind, file: File) {
    const slot = startUpload(DOCUMENT_PURPOSE[kind], file, replaceSlot);
    setDraft((current) => ({ ...current, [kind]: slot }));
  }

  /** O que ainda impede a revisão, fora das regras do contrato. */
  function reviewBlocker(): string | null {
    if (props.blockedReason) return props.blockedReason;
    const slots = allSlots(draft);
    if (slots.some((slot) => slot.status === 'enviando')) {
      return 'Aguarde o fim do envio dos arquivos.';
    }
    if (slots.some((slot) => slot.status === 'erro')) {
      return 'Remova os arquivos que não foram enviados e escolha-os novamente.';
    }
    if (xmlFileId && invoiceCheck.isFetching) {
      return 'Aguarde a validação do XML.';
    }
    if (invoiceCheck.data?.issues.some((issue) => issue.blocking)) {
      return 'O XML tem divergências. Troque o arquivo ou remova-o e anexe a declaração de conteúdo.';
    }
    return null;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready) {
      open.mutate(ready);
      return;
    }
    const problem = reviewBlocker();
    const parsed = openOwnRmaSchema.safeParse(toOpeningInput(draft));
    setErrors(parsed.success ? {} : zodErrors(parsed.error));
    if (problem || !parsed.success) {
      setFormError(problem ?? 'Confira os campos destacados.');
      top.current?.scrollIntoView({ block: 'start' });
      return;
    }
    setFormError(null);
    showStage(parsed.data);
  }

  return (
    <div ref={top} className="stack">
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate className="opening-form">
        {ready ? (
          <OpeningReview draft={draft} customer={props.customerSummary} />
        ) : (
          <>
            {draft.items.map((item, index) => (
              <ItemFields
                key={item.key}
                item={item}
                index={index}
                total={draft.items.length}
                errors={errors}
                onChange={(change) => updateItem(item.key, change)}
                onAddPhotos={(files) => addPhotos(item.key, files)}
                onRemovePhoto={(slotKey) => removePhoto(item.key, slotKey)}
                onMove={(offset) => move(index, offset)}
                onRemove={() => removeItem(item.key)}
              />
            ))}
            {errors.items && <span className="error">{errors.items}</span>}
            {draft.items.length < MAX_ITEMS_PER_RMA && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    items: [...current.items, emptyItem()],
                  }))
                }
              >
                <Plus size={18} aria-hidden />
                Adicionar equipamento
              </button>
            )}
            <DocumentsFields
              invoiceXml={draft.invoiceXml}
              declaration={draft.declaration}
              invoiceCheck={invoiceCheck}
              errors={errors}
              onSelect={selectDocument}
              onRemove={(kind) =>
                setDraft((current) => ({ ...current, [kind]: null }))
              }
            />
          </>
        )}
        <div className="actions">
          <SubmitButton pending={open.isPending}>
            {ready ? 'Confirmar abertura' : 'Revisar solicitação'}
          </SubmitButton>
          {ready && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => showStage(null)}
              disabled={open.isPending}
            >
              <ArrowLeft size={18} aria-hidden />
              Voltar e editar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
