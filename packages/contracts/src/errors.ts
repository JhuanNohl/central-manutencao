/** Envelope padrão de erro da API. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_OR_EXPIRED_TOKEN',
  'INVALID_CREDENTIALS',
  'TOO_MANY_REQUESTS',
  'INVALID_ORIGIN',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldIssue {
  /** Caminho do campo, ex.: "customer.document". */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    issues?: FieldIssue[];
    requestId?: string;
  };
}
