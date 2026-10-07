import { changePasswordSchema, ROLE_LABELS } from '@central/contracts';
import { useState } from 'react';
import { post } from '../api/client';
import { useSession } from '../auth/session';
import { Alert, FormAlert } from '../components/feedback';
import { NewPasswordField } from '../components/NewPasswordField';
import { PageHeader, SubmitButton } from '../components/ui';
import { raw, useSchemaForm } from '../lib/forms';
import { PasswordField } from '../components/PasswordField';

export function AccountPage() {
  const { data: account } = useSession();
  // Recria o campo de senha nova (controlado) quando o formulário é limpo.
  const [savedCount, setSavedCount] = useState(0);
  const form = useSchemaForm({
    schema: changePasswordSchema,
    read: (data) => ({
      currentPassword: raw(data, 'currentPassword'),
      newPassword: raw(data, 'newPassword'),
    }),
    submit: (body) => post<void>('/auth/password', body),
    onSuccess: (_, element) => {
      element.reset();
      setSavedCount((count) => count + 1);
    },
  });
  if (!account) return null;

  return (
    <div className="stack">
      <PageHeader title="Minha conta" />
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
              <Alert tone="success">
                Senha alterada. As outras sessões foram encerradas.
              </Alert>
            )}
            <PasswordField
              label="Senha atual"
              name="currentPassword"
              autoComplete="current-password"
              errors={form.fieldErrors}
            />
            <NewPasswordField
              key={savedCount}
              label="Nova senha"
              name="newPassword"
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
