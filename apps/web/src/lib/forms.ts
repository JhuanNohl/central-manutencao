import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { ApiError } from '../api/client';

export type FieldErrors = Record<string, string>;

function issuesToErrors(issues: { path: string; message: string }[]) {
  const errors: FieldErrors = {};
  for (const issue of issues) errors[issue.path] ??= issue.message;
  return errors;
}

/**
 * Formulário validado com o mesmo esquema dos contratos usado pela API.
 * Erros de campo (do navegador ou do servidor) ficam junto de cada campo;
 * os demais aparecem como erro geral. Os valores digitados são preservados.
 */
export function useSchemaForm<S extends z.ZodType, R>(options: {
  schema: S;
  /** Converte o FormData no formato de entrada do esquema. */
  read: (data: FormData) => unknown;
  submit: (value: z.output<S>) => Promise<R>;
  onSuccess?: (result: R, form: HTMLFormElement) => void;
}) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: options.submit,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);

    const parsed = options.schema.safeParse(options.read(new FormData(form)));
    if (!parsed.success) {
      setFieldErrors(
        issuesToErrors(
          parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    setFieldErrors({});

    mutation.mutate(parsed.data, {
      onSuccess: (result) => options.onSuccess?.(result, form),
      onError: (error) => {
        if (error instanceof ApiError && error.issues.length > 0) {
          setFieldErrors(issuesToErrors(error.issues));
        }
        setFormError(
          error instanceof ApiError
            ? error.message
            : 'Erro inesperado. Tente novamente.',
        );
      },
    });
  }

  return {
    onSubmit,
    fieldErrors,
    formError,
    pending: mutation.isPending,
    done: mutation.isSuccess,
  };
}

/** Texto do campo, sem espaços nas pontas; vazio vira `undefined`. */
export function text(data: FormData, name: string): string | undefined {
  const value = data.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Valor bruto (senhas não são aparadas). */
export function raw(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
}
