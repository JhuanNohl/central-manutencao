import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

export type AlertTone = 'error' | 'warning' | 'success';

const ICONS = {
  error: CircleX,
  warning: TriangleAlert,
  success: CircleCheck,
} as const;

/** Faixa de mensagem com ícone e borda lateral na cor do tom. */
export function Alert(props: { tone: AlertTone; children: ReactNode }) {
  const Icon = ICONS[props.tone];
  return (
    <div
      className={`alert alert-${props.tone}`}
      role={props.tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={20} aria-hidden />
      <div className="alert-body">{props.children}</div>
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert tone="error">{message}</Alert>;
}

/** Erro curto ao lado de uma ação (assumir, anexar vídeo). */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <span className="inline-error" role="alert">
      {message}
    </span>
  );
}

/** Erro de consulta, com o código da requisição para o suporte. */
export function QueryError({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Alert tone="error">
      {apiError?.message ?? 'Não foi possível carregar os dados.'}
      {apiError?.requestId && <small>Código: {apiError.requestId}</small>}
    </Alert>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="center-screen" role="status">
      {label}
    </div>
  );
}
