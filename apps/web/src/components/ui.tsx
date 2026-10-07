import { useId, type ReactNode } from 'react';
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

/** Ligação acessível entre o campo e a mensagem de erro ou dica. */
function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

function FieldMessage(props: { id: string; error?: string; hint?: string }) {
  if (props.error) {
    return (
      <span id={`${props.id}-error`} className="error">
        {props.error}
      </span>
    );
  }
  return props.hint ? (
    <span id={`${props.id}-hint`} className="hint">
      {props.hint}
    </span>
  ) : null;
}

/** Campo de texto. Com `value` e `onChange`, é controlado pelo formulário. */
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
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  inputMode?: 'text' | 'email' | 'numeric' | 'tel';
  placeholder?: string;
  maxLength?: number;
  /** Botão dentro do campo, à direita (ex.: ver a senha). */
  action?: ReactNode;
}) {
  const id = useId();
  const error = props.errors?.[props.errorPath ?? props.name];
  const input = (
    <input
      id={id}
      name={props.name}
      type={props.type ?? 'text'}
      autoComplete={props.autoComplete}
      defaultValue={props.defaultValue}
      value={props.value}
      onChange={props.onChange && ((e) => props.onChange?.(e.target.value))}
      required={props.required}
      inputMode={props.inputMode}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, error, props.hint)}
    />
  );
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.action ? (
        <div className="input-with-action">
          {input}
          {props.action}
        </div>
      ) : (
        input
      )}
      <FieldMessage id={id} error={error} hint={props.hint} />
    </div>
  );
}

/** Texto longo controlado (descrição da falha, observações). */
export function TextAreaField(props: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  errors?: FieldErrors;
  errorPath?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();
  const error = props.errors?.[props.errorPath ?? props.name];
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <textarea
        id={id}
        name={props.name}
        rows={props.rows ?? 3}
        maxLength={props.maxLength}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, props.hint)}
      />
      <FieldMessage id={id} error={error} hint={props.hint} />
    </div>
  );
}

export function SelectField(props: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
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
        value={props.value}
        onChange={props.onChange && ((e) => props.onChange?.(e.target.value))}
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
