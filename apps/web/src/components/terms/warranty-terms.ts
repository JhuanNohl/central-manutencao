import type { WarrantyTerms } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { get } from '../../api/client';

const TERMS_PATH = '/legal/warranty-terms';

/** Termo vigente; muda raramente, então fica em cache durante a sessão. */
export function useWarrantyTerms() {
  return useQuery({
    queryKey: [TERMS_PATH],
    queryFn: () => get<WarrantyTerms>(TERMS_PATH),
    staleTime: Infinity,
  });
}
