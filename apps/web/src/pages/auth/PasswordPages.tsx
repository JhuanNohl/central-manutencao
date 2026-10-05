import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  PASSWORD_RESET_TTL_HOURS,
} from '@central/contracts';
import { Link } from 'react-router';
import { post } from '../../api/client';
import { useCaptcha } from '../../components/captcha';
import { Alert, FormAlert } from '../../components/feedback';
import { NewPasswordField } from '../../components/NewPasswordField';
import { Field, SubmitButton } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { raw, text, useSchemaForm } from '../../lib/forms';
import { useLinkToken } from '../../lib/token';

export function ForgotPasswordPage() {
  const captcha = useCaptcha();
  const form = useSchemaForm({
    schema: passwordResetRequestSchema,
    read: (data) => ({ email: text(data, 'email') }),
    submit: (body) =>
      post<void>(
        '/auth/password-reset/request',
        body,
        captcha.consumeHeaders(),
      ),
  });

  return (
    <AuthLayout
      title="Redefinir senha"
      lead={`Informe o e-mail da sua conta. Enviaremos um link válido por ${PASSWORD_RESET_TTL_HOURS} hora.`}
    >
      {form.done ? (
        <Alert tone="success">
          Se houver uma conta ativa com esse e-mail, o link foi enviado. Confira
          também a caixa de spam.
        </Alert>
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
          {captcha.widget}
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
  const token = useLinkToken();
  const form = useSchemaForm({
    schema: passwordResetConfirmSchema,
    read: (data) => ({ token: token ?? '', password: raw(data, 'password') }),
    submit: (body) => post<void>('/auth/password-reset/confirm', body),
  });

  if (!token) {
    return (
      <AuthLayout title="Link incompleto">
        <Alert tone="error">
          Abra o link exatamente como recebido no e-mail ou peça um novo.
        </Alert>
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
          <Alert tone="success">
            Senha redefinida. Por segurança, as sessões abertas foram
            encerradas.
          </Alert>
          <div className="auth-links">
            <Link to="/entrar">Entrar com a nova senha</Link>
          </div>
        </>
      ) : (
        <form onSubmit={form.onSubmit} noValidate>
          <FormAlert message={form.formError} />
          <NewPasswordField
            label="Nova senha"
            name="password"
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
