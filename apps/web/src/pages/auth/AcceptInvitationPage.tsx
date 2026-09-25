import {
  acceptInvitationSchema,
  ROLE_LABELS,
  type InvitationPreview,
  type MeResponse,
} from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { useSetSession } from '../../auth/session';
import {
  Field,
  FormAlert,
  Loading,
  QueryError,
  SubmitButton,
} from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { formatDateTime } from '../../lib/format';
import { raw, text, useSchemaForm } from '../../lib/forms';
import { useEmailLinkToken } from '../../lib/token';

export function AcceptInvitationPage() {
  const token = useEmailLinkToken();
  const setSession = useSetSession();
  const navigate = useNavigate();

  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: () => post<InvitationPreview>('/invitations/lookup', { token }),
  });

  const form = useSchemaForm({
    schema: acceptInvitationSchema,
    read: (data) => ({
      token: token ?? '',
      name: text(data, 'name'),
      password: raw(data, 'password'),
    }),
    submit: (body) => post<MeResponse>('/invitations/accept', body),
    onSuccess: ({ account }) => {
      setSession(account);
      void navigate('/', { replace: true });
    },
  });

  if (!token) {
    return (
      <AuthLayout title="Convite">
        <div className="alert alert-error">
          Abra o link exatamente como recebido no e-mail.
        </div>
      </AuthLayout>
    );
  }
  if (preview.isPending) return <Loading />;
  if (preview.isError) {
    return (
      <AuthLayout title="Convite indisponível">
        <QueryError error={preview.error} />
        <p className="muted">
          Convites valem por 7 dias e podem ser usados uma única vez. Peça um
          novo convite a quem enviou.
        </p>
        <div className="auth-links">
          <Link to="/entrar">Ir para o login</Link>
        </div>
      </AuthLayout>
    );
  }

  const invitation = preview.data;
  return (
    <AuthLayout
      title="Aceitar convite"
      lead={
        invitation.customerName
          ? `Acesso ao portal como contato de ${invitation.customerName}.`
          : `Acesso à equipe como ${ROLE_LABELS[invitation.role]}.`
      }
    >
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />
        <dl className="details">
          <dt>E-mail</dt>
          <dd>{invitation.email}</dd>
          <dt>Válido até</dt>
          <dd>{formatDateTime(invitation.expiresAt)}</dd>
        </dl>
        <Field
          label="Seu nome"
          name="name"
          autoComplete="name"
          defaultValue={invitation.suggestedName ?? ''}
          errors={form.fieldErrors}
        />
        <Field
          label="Crie uma senha"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Pelo menos 10 caracteres."
          errors={form.fieldErrors}
        />
        <SubmitButton pending={form.pending} block>
          Aceitar e entrar
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
