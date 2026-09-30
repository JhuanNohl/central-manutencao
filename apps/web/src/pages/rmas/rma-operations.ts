import type { AssignRmaRequest, RmaAssignmentView } from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patch } from '../../api/client';
import { RMAS_PATH } from './RmasPage';

/**
 * Operação da equipe sobre um chamado. Com sucesso ou conflito, fila, início
 * e detalhe voltam a mostrar o estado atual: outra pessoa pode ter agido antes.
 */
export function useRmaOperation<Input, Result>(
  operation: (input: Input) => Promise<Result>,
  onSuccess?: () => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: operation,
    onSuccess,
    onSettled: () => client.invalidateQueries({ queryKey: [RMAS_PATH] }),
  });
}

/** Assumir, transferir ou liberar; `expectedAssigneeId` é o que a tela mostrava. */
export function useAssignRma(number: number) {
  return useRmaOperation((body: AssignRmaRequest) =>
    patch<RmaAssignmentView>(`${RMAS_PATH}/${number}/assignee`, body),
  );
}
