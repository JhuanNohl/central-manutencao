import type { Page } from '@central/contracts';
import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';
import { get, toQuery } from '../api/client';

/** Opções de itens por página (a API aceita até 100). */
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 25;

/**
 * Listagem paginada com filtros. A chave de cache começa pelo `path`, de
 * modo que `invalidateQueries({ queryKey: [path] })` atualiza todas as páginas.
 * Mudar um filtro ou o tamanho da página volta para a primeira página.
 */
export function usePagedList<Item, Filters extends Record<string, string>>(
  path: string,
  initialFilters: Filters,
  options: { refetchInterval?: number } = {},
): PagedList<Item> & {
  filters: Filters;
  setFilter: (change: Partial<Filters>) => void;
} {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const query = useQuery({
    queryKey: [path, filters, page, pageSize],
    queryFn: () =>
      get<Page<Item>>(`${path}${toQuery({ ...filters, page, pageSize })}`),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
  });

  return {
    query,
    filters,
    setFilter: (change: Partial<Filters>) => {
      setFilters((current) => ({ ...current, ...change }));
      setPage(1);
    },
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

/** O que o corpo da listagem precisa: a consulta e a navegação entre páginas. */
export interface PagedList<Item> {
  query: UseQueryResult<Page<Item>>;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
}
