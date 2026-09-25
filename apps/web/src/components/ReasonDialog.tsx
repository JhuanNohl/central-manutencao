import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

/**
 * Confirmação com justificativa obrigatória, para ações auditadas
 * (desativar conta, mudar papel etc.).
 */
export function ReasonDialog(props: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  children?: ReactNode;
  onConfirm: (reason: string, data: FormData) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reason = String(data.get('reason') ?? '').trim();
    if (reason.length < 3) {
      setLocalError('Informe o motivo (mínimo de 3 caracteres).');
      return;
    }
    setLocalError(null);
    props.onConfirm(reason, data);
  }

  const error = localError ?? props.error;
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
          {props.description && <p className="muted">{props.description}</p>}
          {props.children}
          <div className="field">
            <label htmlFor={`${id}-reason`}>
              Motivo (fica registrado no histórico)
            </label>
            <textarea
              id={`${id}-reason`}
              name="reason"
              rows={3}
              maxLength={500}
            />
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <div className="actions">
            <button
              type="submit"
              className={`btn ${props.danger ? 'btn-danger' : 'btn-primary'}`}
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
