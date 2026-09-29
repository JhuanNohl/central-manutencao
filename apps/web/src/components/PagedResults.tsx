import type { ReactNode } from 'react';
import type { PagedList } from '../lib/paged-list';
import { QueryError } from './feedback';
import { Pagination } from './Pagination';

/**
 * Corpo comum das listagens: erro, tabela, mensagem de vazio e paginação.
 * A página só define a tabela dos itens (ou os cards, com `bodyClassName`).
 */
export function PagedResults<Item>(props: {
  list: PagedList<Item>;
  emptyMessage: string;
  bodyClassName?: string;
  children: (items: Item[]) => ReactNode;
}) {
  const { query, setPage, setPageSize } = props.list;
  if (query.isError) {
    return (
      <div className="panel-body">
        <QueryError error={query.error} />
      </div>
    );
  }
  if (!query.data) return null;

  return (
    <>
      <div className={props.bodyClassName ?? 'table-wrap'}>
        {props.children(query.data.items)}
        {query.data.items.length === 0 && (
          <div className="empty">{props.emptyMessage}</div>
        )}
      </div>
      <Pagination {...query.data} onPage={setPage} onPageSize={setPageSize} />
    </>
  );
}
