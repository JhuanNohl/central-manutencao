import type { RmaCancellationView, RmaDetail } from '@central/contracts';
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

  if (rma.items.some((item) => item.receivedAt)) return null;
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
        description="O chamado sai da fila ativa e não aceita envio nem recebimento. Nada é apagado, e o solicitante recebe o motivo por e-mail."
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
