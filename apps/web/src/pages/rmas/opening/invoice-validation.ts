import type { InvoiceValidationView } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { post } from '../../../api/client';

/**
 * Validação do XML enviado. A chave inclui o arquivo e o cliente: ao trocar
 * o XML (ou o cliente, na abertura pela equipe), o resultado anterior deixa
 * de valer, e uma resposta atrasada nunca aparece para o arquivo novo (CA03).
 */
export function useInvoiceValidation(
  fileId: string | undefined,
  customerId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['invoice-validation', fileId, customerId],
    queryFn: () =>
      post<InvoiceValidationView>('/invoice-validations', {
        fileId,
        customerId,
      }),
    enabled: enabled && fileId !== undefined,
    staleTime: Infinity,
    retry: false,
  });
}
