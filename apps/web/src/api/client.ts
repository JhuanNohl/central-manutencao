import type { ApiErrorBody, ErrorCode, FieldIssue } from '@central/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues: FieldIssue[] = [],
    readonly requestId?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Chamada à API na mesma origem. O cookie de sessão viaja automaticamente;
 * o navegador envia o cabeçalho Origin exigido pela proteção contra CSRF.
 */
export async function api<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'INTERNAL_ERROR',
      'Não foi possível contatar o servidor. Verifique sua conexão e tente novamente.',
    );
  }

  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return data as T;

  const error = (data as ApiErrorBody | null)?.error;
  throw new ApiError(
    response.status,
    error?.code ?? 'INTERNAL_ERROR',
    error?.message ??
      (response.status >= 500
        ? 'Servidor indisponível no momento. Tente novamente em instantes.'
        : 'Erro inesperado.'),
    error?.issues,
    error?.requestId,
  );
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>('POST', path, body ?? {});
export const patch = <T>(path: string, body?: unknown) =>
  api<T>('PATCH', path, body ?? {});

export function toQuery(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
