import { changePasswordSchema, ROLE_LABELS } from '@central/contracts';
import { useMutation } from '@tanstack/react-query';
import { post } from '../api/client';
import { useSession } from '../auth/session';
import { Field, FormAlert, PageHeader, SubmitButton } from '../components/ui';
import { raw, useSchemaForm } from '../lib/forms';

export function EmailVerificationNotice() {
  const { data: account } = useSession();
  const resend = useMutation({
    mutationFn: () => post<void>('/auth/email-verification/resend'),
  });
  if (!account || account.emailVerified) return null;

  return (
    <div className="alert alert-warning" role="status">
      Confirme seu e-mail pelo link que enviamos para{' '}
      <strong>{account.email}</strong>.{' '}
      {resend.isSuccess ? (
        'Novo link enviado.'
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
        >
          Reenviar link
        </button>
      )}
    </div>
  );
}

export function AccountPage() {
  const { data: account } = useSession();
  const form = useSchemaForm({
    schema: changePasswordSchema,
    read: (data) => ({
      currentPassword: raw(data, 'currentPassword'),
      newPassword: raw(data, 'newPassword'),
    }),
    submit: (body) => post<void>('/auth/password', body),
    onSuccess: (_, element) => element.reset(),
  });
  if (!account) return null;

  return (
    <div className="stack">
      <PageHeader title="Minha conta" />
      <EmailVerificationNotice />
      <div className="grid-2">
        <section className="card">
          <h2>Dados de acesso</h2>
          <dl className="details">
            <dt>Nome</dt>
            <dd>{account.name}</dd>
            <dt>E-mail</dt>
            <dd>{account.email}</dd>
            <dt>Papel</dt>
            <dd>{ROLE_LABELS[account.role]}</dd>
            {account.customer && (
              <>
                <dt>Cliente</dt>
                <dd>{account.customer.name}</dd>
              </>
            )}
          </dl>
        </section>
        <section className="card">
          <h2>Trocar senha</h2>
          <form onSubmit={form.onSubmit} noValidate>
            <FormAlert message={form.formError} />
            {form.done && (
              <div className="alert alert-success" role="status">
                Senha alterada. As outras sessões foram encerradas.
              </div>
            )}
            <Field
              label="Senha atual"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              errors={form.fieldErrors}
            />
            <Field
              label="Nova senha"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              hint="Pelo menos 10 caracteres."
              errors={form.fieldErrors}
            />
            <div className="actions">
              <SubmitButton pending={form.pending}>Salvar</SubmitButton>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
