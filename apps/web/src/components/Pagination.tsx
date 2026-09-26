import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { PAGE_SIZE_OPTIONS } from '../lib/paged-list';

/** Quantidade máxima de números de página visíveis ao mesmo tempo. */
const VISIBLE_PAGES = 5;

/** Números de página centrados na atual, sem sair do intervalo válido. */
export function visiblePages(current: number, last: number): number[] {
  const count = Math.min(VISIBLE_PAGES, last);
  const start = Math.min(
    Math.max(1, current - Math.floor(count / 2)),
    last - count + 1,
  );
  return Array.from({ length: count }, (_, index) => start + index);
}

function rangeLabel(first: number, end: number, total: number): string {
  const noun = total === 1 ? 'item' : 'itens';
  return total === 0 ? `0 ${noun}` : `${first}–${end} de ${total} ${noun}`;
}

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const id = useId();
  const last = Math.max(1, Math.ceil(props.total / props.pageSize));
  const first = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const end = Math.min(props.page * props.pageSize, props.total);
  const go = (page: number) => props.onPage(page);

  return (
    <nav className="pagination" aria-label="Paginação">
      <div className="pagination-info">
        <label htmlFor={id}>
          Itens por página:
          <select
            id={id}
            value={props.pageSize}
            onChange={(e) => props.onPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span>{rangeLabel(first, end, props.total)}</span>
      </div>
      <div className="pages">
        <PageButton
          label="Primeira página"
          disabled={props.page <= 1}
          onClick={() => go(1)}
        >
          <ChevronsLeft size={18} aria-hidden />
        </PageButton>
        <PageButton
          label="Página anterior"
          disabled={props.page <= 1}
          onClick={() => go(props.page - 1)}
        >
          <ChevronLeft size={18} aria-hidden />
        </PageButton>
        {visiblePages(props.page, last).map((page) => (
          <button
            key={page}
            type="button"
            className="page-button"
            aria-current={page === props.page ? 'page' : undefined}
            onClick={() => go(page)}
          >
            {page}
          </button>
        ))}
        <PageButton
          label="Próxima página"
          disabled={props.page >= last}
          onClick={() => go(props.page + 1)}
        >
          <ChevronRight size={18} aria-hidden />
        </PageButton>
        <PageButton
          label="Última página"
          disabled={props.page >= last}
          onClick={() => go(last)}
        >
          <ChevronsRight size={18} aria-hidden />
        </PageButton>
      </div>
    </nav>
  );
}

function PageButton(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="page-button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
