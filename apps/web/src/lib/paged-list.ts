import type { Page } from '@central/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { get, toQuery } from '../api/client';

export const PAGE_SIZE = 25;

/**
 * Listagem paginada com filtros. A chave de cache começa pelo `path`, de
 * modo que `invalidateQueries({ queryKey: [path] })` atualiza todas as páginas.
 * Mudar um filtro volta para a primeira página.
 */
export function usePagedList<Item, Filters extends Record<string, string>>(
  path: string,
  initialFilters: Filters,
  options: { refetchInterval?: number } = {},
) {
  const [state, setState] = useState({ ...initialFilters, page: 1 });

  const query = useQuery({
    queryKey: [path, state],
    queryFn: () =>
      get<Page<Item>>(`${path}${toQuery({ ...state, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
  });

  return {
    query,
    filters: state as Filters,
    setFilter: (change: Partial<Filters>) =>
      setState((current) => ({ ...current, ...change, page: 1 })),
    setPage: (page: number) => setState((current) => ({ ...current, page })),
  };
}
