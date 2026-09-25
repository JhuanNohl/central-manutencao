import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from '@central/contracts';
import { Link } from 'react-router';
import { post } from '../../api/client';
import { Field, FormAlert, SubmitButton } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { raw, text, useSchemaForm } from '../../lib/forms';
import { useEmailLinkToken } from '../../lib/token';

export function ForgotPasswordPage() {
  const form = useSchemaForm({
    schema: passwordResetRequestSchema,
    read: (data) => ({ email: text(data, 'email') }),
    submit: (body) => post<void>('/auth/password-reset/request', body),
  });

  return (
    <AuthLayout
      title="Redefinir senha"
      lead="Informe o e-mail da sua conta. Enviaremos um link válido por 1 hora."
    >
      {form.done ? (
        <div className="alert alert-success" role="status">
          Se houver uma conta ativa com esse e-mail, o link foi enviado. Confira
          também a caixa de spam.
        </div>
      ) : (
        <form onSubmit={form.onSubmit} noValidate>
          <FormAlert message={form.formError} />
          <Field
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            errors={form.fieldErrors}
          />
          <SubmitButton pending={form.pending} block>
            Enviar link
          </SubmitButton>
        </form>
      )}
      <div className="auth-links">
        <Link to="/entrar">Voltar ao login</Link>
      </div>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const token = useEmailLinkToken();
  const form = useSchemaForm({
    schema: passwordResetConfirmSchema,
    read: (data) => ({ token: token ?? '', password: raw(data, 'password') }),
    submit: (body) => post<void>('/auth/password-reset/confirm', body),
  });

  if (!token) {
    return (
      <AuthLayout title="Link incompleto">
        <div className="alert alert-error">
          Abra o link exatamente como recebido no e-mail ou peça um novo.
        </div>
        <div className="auth-links">
          <Link to="/esqueci-senha">Pedir novo link</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nova senha">
      {form.done ? (
        <>
          <div className="alert alert-success" role="status">
            Senha redefinida. Por segurança, as sessões abertas foram
            encerradas.
          </div>
          <div className="auth-links">
            <Link to="/entrar">Entrar com a nova senha</Link>
          </div>
        </>
      ) : (
        <form onSubmit={form.onSubmit} noValidate>
          <FormAlert message={form.formError} />
          <Field
            label="Nova senha"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="Pelo menos 10 caracteres."
            errors={form.fieldErrors}
          />
          <SubmitButton pending={form.pending} block>
            Salvar nova senha
          </SubmitButton>
          {form.formError && <Link to="/esqueci-senha">Pedir novo link</Link>}
        </form>
      )}
    </AuthLayout>
  );
}
