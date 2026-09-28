import {
  RECEIVABLE_STAGES,
  type RmaDetail,
  type StaffReceiptView,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PackageOpen } from 'lucide-react';
import { useState } from 'react';
import { errorMessage, post } from '../../api/client';
import { ItemsSelectionDialog } from './ItemsSelectionDialog';

/**
 * Registro do recebimento físico pela equipe. Só itens ainda não recebidos
 * aparecem; cada item confirmado inicia o próprio prazo.
 */
export function ReceiveItemsAction({ rma }: { rma: RmaDetail }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const receivable = rma.items.filter(
    (item) => !item.receivedAt && RECEIVABLE_STAGES.includes(item.stage),
  );
  const receive = useMutation({
    mutationFn: (itemIds: string[]) =>
      post<StaffReceiptView>(`/rmas/${rma.number}/receipts`, { itemIds }),
    onSuccess: () => setOpen(false),
    // Sucesso ou conflito: a lista de itens elegíveis precisa ser recarregada.
    onSettled: () => client.invalidateQueries({ queryKey: ['/rmas'] }),
  });

  if (receivable.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          receive.reset();
          setOpen(true);
        }}
      >
        <PackageOpen size={18} aria-hidden />
        Registrar recebimento
      </button>
      <ItemsSelectionDialog
        open={open}
        title="Registrar recebimento"
        description="Selecione somente os equipamentos que chegaram fisicamente. O prazo de cada um começa agora."
        items={receivable}
        confirmLabel="Confirmar recebimento"
        pending={receive.isPending}
        error={errorMessage(receive.error)}
        onConfirm={(itemIds) => receive.mutate(itemIds)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
