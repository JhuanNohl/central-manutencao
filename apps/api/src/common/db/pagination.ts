import type { Page, PaginationQuery } from '@central/contracts';

/** Janela `limit`/`offset` da página pedida. */
export function pageWindow(query: PaginationQuery) {
  return {
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  };
}

/**
 * Monta a página a partir da consulta dos itens (já limitada com
 * `pageWindow`) e da contagem total, executadas em paralelo.
 */
export async function toPage<Row, Item>(
  query: PaginationQuery,
  rows: PromiseLike<Row[]>,
  total: PromiseLike<{ total: number }[]>,
  map: (row: Row) => Item,
): Promise<Page<Item>> {
  const [items, [counted]] = await Promise.all([rows, total]);
  return {
    items: items.map(map),
    page: query.page,
    pageSize: query.pageSize,
    total: counted?.total ?? 0,
  };
}
