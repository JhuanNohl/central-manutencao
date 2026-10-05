import { loginRequestSchema, type MeResponse } from '@central/contracts';
import { Link, useLocation, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { useSetSession } from '../../auth/session';
import { useCaptcha } from '../../components/captcha';
import { FormAlert } from '../../components/feedback';
import { Field, SubmitButton } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { raw, text, useSchemaForm } from '../../lib/forms';

export function LoginPage() {
  const setSession = useSetSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const captcha = useCaptcha();

  const form = useSchemaForm({
    schema: loginRequestSchema,
    read: (data) => ({
      email: text(data, 'email'),
      password: raw(data, 'password'),
    }),
    submit: (body) =>
      post<MeResponse>('/auth/login', body, captcha.consumeHeaders()),
    onSuccess: ({ account }) => {
      setSession(account);
      void navigate(from, { replace: true });
    },
  });

  return (
    <AuthLayout title="Acesse sua conta">
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />
        <Field
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          errors={form.fieldErrors}
        />
        <Field
          label="Senha"
          name="password"
          type="password"
          autoComplete="current-password"
          errors={form.fieldErrors}
        />
        {captcha.widget}
        <SubmitButton pending={form.pending} block>
          Entrar
        </SubmitButton>
      </form>
      <div className="auth-links">
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
        <Link to="/cadastro">Criar conta</Link>
      </div>
    </AuthLayout>
  );
}
