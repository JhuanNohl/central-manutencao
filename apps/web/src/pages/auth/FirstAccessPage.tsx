import { changePasswordSchema } from '@central/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../../api/client';
import { SESSION_KEY } from '../../auth/session';
import { FormAlert } from '../../components/feedback';
import { NewPasswordField } from '../../components/NewPasswordField';
import { SubmitButton } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { useLogout } from '../../layouts/UserMenu';
import { raw, useSchemaForm } from '../../lib/forms';
import { PasswordField } from '../../components/PasswordField';

/**
 * Primeiro acesso de conta criada pela equipe: até trocar a senha provisória
 * recebida por e-mail, o restante do sistema fica bloqueado (também na API).
 */
export function FirstAccessPage() {
  const client = useQueryClient();
  const logout = useLogout();
  const form = useSchemaForm({
    schema: changePasswordSchema,
    read: (data) => ({
      currentPassword: raw(data, 'currentPassword'),
      newPassword: raw(data, 'newPassword'),
    }),
    submit: (body) => post<void>('/auth/password', body),
    // A sessão recarregada já vem sem a exigência e libera o sistema.
    onSuccess: () => void client.invalidateQueries({ queryKey: SESSION_KEY }),
  });

  return (
    <AuthLayout
      title="Troque a senha provisória"
      lead="Por segurança, escolha uma senha sua antes do primeiro acesso."
    >
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />
        <PasswordField
          label="Senha provisória (recebida por e-mail)"
          name="currentPassword"
          autoComplete="current-password"
          errors={form.fieldErrors}
        />
        <NewPasswordField
          label="Nova senha"
          name="newPassword"
          errors={form.fieldErrors}
        />
        <SubmitButton pending={form.pending} block>
          Salvar senha e entrar
        </SubmitButton>
      </form>
      <div className="auth-links">
        <button
          type="button"
          className="link-button"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Sair
        </button>
      </div>
    </AuthLayout>
  );
}
