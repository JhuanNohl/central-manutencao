import { useId, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import type { FieldErrors } from '../lib/forms';

export function PageHeader(props: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{props.title}</h1>
        {props.description && <p>{props.description}</p>}
      </div>
      {props.actions && <div className="actions">{props.actions}</div>}
    </header>
  );
}

export function Field(props: {
  label: string;
  name: string;
  errors?: FieldErrors;
  /** Caminho do erro, quando difere do `name` (ex.: "customer.document"). */
  errorPath?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  required?: boolean;
  inputMode?: 'text' | 'email' | 'numeric' | 'tel';
  placeholder?: string;
}) {
  const id = useId();
  const error = props.errors?.[props.errorPath ?? props.name];
  const describedBy = error
    ? `${id}-error`
    : props.hint
      ? `${id}-hint`
      : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        defaultValue={props.defaultValue}
        required={props.required}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <span id={`${id}-error`} className="error">
          {error}
        </span>
      ) : (
        props.hint && (
          <span id={`${id}-hint`} className="hint">
            {props.hint}
          </span>
        )
      )}
    </div>
  );
}

export function SelectField(props: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  errors?: FieldErrors;
}) {
  const id = useId();
  const error = props.errors?.[props.name];
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <select
        id={id}
        name={props.name}
        defaultValue={props.defaultValue}
        aria-invalid={error ? true : undefined}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      {message}
    </div>
  );
}

/** Mostra o erro de uma consulta, com o código da requisição para suporte. */
export function QueryError({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div className="alert alert-error" role="alert">
      {apiError?.message ?? 'Não foi possível carregar os dados.'}
      {apiError?.requestId && <small>Código: {apiError.requestId}</small>}
    </div>
  );
}

export function SubmitButton(props: {
  pending: boolean;
  children: ReactNode;
  block?: boolean;
}) {
  return (
    <button
      type="submit"
      className={`btn btn-primary${props.block ? ' btn-block' : ''}`}
      disabled={props.pending}
    >
      {props.pending ? 'Aguarde…' : props.children}
    </button>
  );
}

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`badge${tone === 'neutral' ? '' : ` badge-${tone}`}`}>
      {children}
    </span>
  );
}

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return (
    <div className="pagination">
      <span>
        {props.total} registro{props.total === 1 ? '' : 's'} · página{' '}
        {props.page} de {pages}
      </span>
      <div className="actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={props.page <= 1}
          onClick={() => props.onPage(props.page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={props.page >= pages}
          onClick={() => props.onPage(props.page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="center-screen" role="status">
      {label}
    </div>
  );
}
