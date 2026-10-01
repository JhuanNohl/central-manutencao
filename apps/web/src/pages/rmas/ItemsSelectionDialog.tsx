import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { FormAlert } from '../../components/feedback';

export interface SelectableItem {
  id: string;
  position: number;
  model: string;
  serialNumber: string;
  /** Situação mostrada ao lado do item (ex.: a etapa atual). */
  detail?: string;
  /** Item visível, mas sem seleção, com o motivo por escrito. */
  disabledReason?: string;
}

const itemLabel = (item: SelectableItem) =>
  `${item.position}. ${item.model} (S/N ${item.serialNumber})`;

/**
 * Seleção de equipamentos para uma movimentação (envio, recebimento, etapa).
 * Mostra a relação exata que será gravada antes da confirmação (5.5).
 */
export function ItemsSelectionDialog(props: {
  open: boolean;
  title: string;
  description: ReactNode;
  items: SelectableItem[];
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  /** Campos depois da lista (ex.: modalidade de envio, nova etapa). */
  children?: ReactNode;
  /** Avisa a cada mudança, quando os campos dependem da seleção. */
  onSelectionChange?: (itemIds: string[]) => void;
  onConfirm: (itemIds: string[], data: FormData) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      setSelected(new Set());
      setLocalError(null);
      props.onSelectionChange?.([]);
      dialog.showModal();
    }
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  function toggle(itemId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(itemId);
    else next.delete(itemId);
    setSelected(next);
    props.onSelectionChange?.([...next]);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosen = props.items.filter((item) => selected.has(item.id));
    if (chosen.length === 0) {
      setLocalError('Selecione pelo menos um equipamento.');
      return;
    }
    setLocalError(null);
    props.onConfirm(
      chosen.map((item) => item.id),
      new FormData(event.currentTarget),
    );
  }

  const chosen = props.items.filter((item) => selected.has(item.id));
  return (
    <dialog
      ref={ref}
      className="card dialog"
      onClose={props.onClose}
      aria-labelledby={`${id}-title`}
    >
      {props.open && (
        <form onSubmit={onSubmit} noValidate>
          <h2 id={`${id}-title`}>{props.title}</h2>
          <p className="muted">{props.description}</p>
          <fieldset>
            <legend>Equipamentos</legend>
            <div className="check-list">
              {props.items.map((item) => (
                <label
                  key={item.id}
                  aria-disabled={item.disabledReason ? true : undefined}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    disabled={Boolean(item.disabledReason)}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                  />
                  <span>
                    {itemLabel(item)}
                    {item.detail && (
                      <span className="muted"> · {item.detail}</span>
                    )}
                    {item.disabledReason && (
                      <span className="check-note">{item.disabledReason}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {props.children}
          <div className="selection-summary" aria-live="polite">
            {chosen.length === 0
              ? 'Nenhum equipamento selecionado.'
              : `Será registrado para: ${chosen.map(itemLabel).join('; ')}.`}
          </div>
          <FormAlert message={localError ?? props.error} />
          <div className="actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={props.pending}
            >
              {props.pending ? 'Aguarde…' : props.confirmLabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={props.onClose}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
