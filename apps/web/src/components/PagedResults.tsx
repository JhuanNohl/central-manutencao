import type { Page } from '@central/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Pagination, QueryError } from './ui';

/**
 * Moldura comum das listagens: erro, tabela, mensagem de vazio e paginação.
 * A página só define a tabela dos itens.
 */
export function PagedResults<Item>(props: {
  query: UseQueryResult<Page<Item>>;
  emptyMessage: string;
  onPage: (page: number) => void;
  children: (items: Item[]) => ReactNode;
}) {
  const { query } = props;
  if (query.isError) return <QueryError error={query.error} />;
  if (!query.data) return null;

  return (
    <>
      <div className="table-wrap">
        {props.children(query.data.items)}
        {query.data.items.length === 0 && (
          <div className="empty">{props.emptyMessage}</div>
        )}
      </div>
      <Pagination {...query.data} onPage={props.onPage} />
    </>
  );
}
