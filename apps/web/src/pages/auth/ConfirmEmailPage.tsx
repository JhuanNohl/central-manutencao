import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { ApiError, post } from '../../api/client';
import { SESSION_KEY } from '../../auth/session';
import { AuthLayout } from '../../layouts/AuthLayout';
import { useEmailLinkToken } from '../../lib/token';

export function ConfirmEmailPage() {
  const token = useEmailLinkToken();
  const client = useQueryClient();
  const confirm = useMutation({
    mutationFn: (value: string) =>
      post<void>('/auth/email-verification/confirm', { token: value }),
    onSuccess: () => client.invalidateQueries({ queryKey: SESSION_KEY }),
  });
  const { mutate } = confirm;
  // O token é de uso único: garante um só envio, mesmo com efeitos repetidos.
  const sent = useRef(false);

  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      mutate(token);
    }
  }, [token, mutate]);

  return (
    <AuthLayout title="Confirmação de e-mail">
      {!token && (
        <div className="alert alert-error">
          Abra o link exatamente como recebido no e-mail.
        </div>
      )}
      {confirm.isPending && <p className="muted">Confirmando…</p>}
      {confirm.isSuccess && (
        <div className="alert alert-success" role="status">
          E-mail confirmado. Você receberá os avisos dos seus atendimentos.
        </div>
      )}
      {confirm.isError && (
        <div className="alert alert-error" role="alert">
          {confirm.error instanceof ApiError
            ? confirm.error.message
            : 'Não foi possível confirmar.'}{' '}
          Você pode pedir um novo link na página da sua conta.
        </div>
      )}
      <div className="auth-links">
        <Link to="/">Ir para o início</Link>
      </div>
    </AuthLayout>
  );
}
