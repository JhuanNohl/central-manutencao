import {
  isCancellable,
  type RmaCancellationView,
  type RmaDetail,
} from '@central/contracts';
import { Ban } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, post } from '../../api/client';
import { ReasonDialog } from '../../components/ReasonDialog';
import { useRmaOperation } from './rma-operations';
import { rmaLabel } from './rma-styles';
import { RMAS_PATH } from './RmasPage';

/**
 * Cancelamento com motivo, enquanto nenhum equipamento chegou à fábrica.
 * Nada é apagado: a nota fiscal e o histórico continuam no chamado.
 */
export function CancelRmaAction({ rma }: { rma: RmaDetail }) {
  const [open, setOpen] = useState(false);
  const cancel = useRmaOperation(
    (reason: string) =>
      post<RmaCancellationView>(`${RMAS_PATH}/${rma.number}/cancellation`, {
        reason,
      }),
    () => setOpen(false),
  );

  if (!isCancellable(rma.items)) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          cancel.reset();
          setOpen(true);
        }}
      >
        <Ban size={18} aria-hidden />
        Cancelar chamado
      </button>
      <ReasonDialog
        open={open}
        title={`Cancelar o chamado ${rmaLabel(rma.number)}?`}
        description="Use quando o cliente não quiser seguir com a manutenção. O chamado sai da fila e não muda mais; nada é apagado, e ficam registrados quem cancelou, quando e o motivo, que o solicitante recebe por e-mail."
        confirmLabel="Cancelar chamado"
        closeLabel="Voltar"
        danger
        pending={cancel.isPending}
        error={errorMessage(cancel.error)}
        onConfirm={(reason) => cancel.mutate(reason)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
