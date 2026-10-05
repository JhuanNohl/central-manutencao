import { REASON_LENGTH, reasonSchema } from '@central/contracts';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormAlert } from './feedback';
import { useModalDialog } from './use-modal-dialog';

/**
 * Confirmação com justificativa obrigatória, para ações auditadas
 * (desativar conta, mudar papel etc.).
 */
export function ReasonDialog(props: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Rótulo do botão que fecha sem agir; muda quando a ação já é "cancelar". */
  closeLabel?: string;
  danger?: boolean;
  pending?: boolean;
  error?: string | null;
  children?: ReactNode;
  onConfirm: (reason: string, data: FormData) => void;
  onClose: () => void;
}) {
  const ref = useModalDialog(props.open);
  const id = useId();
  const [localError, setLocalError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reason = reasonSchema.safeParse(data.get('reason') ?? '');
    if (!reason.success) {
      setLocalError(reason.error.issues[0].message);
      return;
    }
    setLocalError(null);
    props.onConfirm(reason.data, data);
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
              maxLength={REASON_LENGTH.max}
            />
          </div>
          <FormAlert message={error ?? null} />
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
              {props.closeLabel ?? 'Cancelar'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
