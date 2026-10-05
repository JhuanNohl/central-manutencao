import {
  registerRequestSchema,
  type CustomerKind,
  type MeResponse,
} from '@central/contracts';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { useSetSession } from '../../auth/session';
import {
  CustomerKindField,
  customerKindLabels,
} from '../../components/CustomerKindField';
import { useCaptcha } from '../../components/captcha';
import { FormAlert } from '../../components/feedback';
import { DocumentField, PhoneField } from '../../components/masked-fields';
import { NewPasswordField } from '../../components/NewPasswordField';
import { TermsAcceptance } from '../../components/terms/TermsAcceptance';
import { Field, SubmitButton } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { raw, text, useSchemaForm } from '../../lib/forms';

export function RegisterPage() {
  const setSession = useSetSession();
  const navigate = useNavigate();
  const [kind, setKind] = useState<CustomerKind>('pessoa_juridica');
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const captcha = useCaptcha();
  const labels = customerKindLabels(kind);
  const { company } = labels;

  const form = useSchemaForm({
    schema: registerRequestSchema,
    read: (data) => ({
      customer: {
        kind,
        name: company ? text(data, 'customerName') : text(data, 'contactName'),
        tradeName: company ? text(data, 'tradeName') : undefined,
        document: text(data, 'document') ?? '',
      },
      contact: { name: text(data, 'contactName'), phone: text(data, 'phone') },
      email: text(data, 'email'),
      password: raw(data, 'password'),
      termsVersion: termsVersion ?? undefined,
    }),
    submit: (body) =>
      post<MeResponse>('/auth/register', body, captcha.consumeHeaders()),
    onSuccess: ({ account }) => {
      setSession(account);
      void navigate('/', { replace: true });
    },
  });
  const errors = form.fieldErrors;

  return (
    <AuthLayout
      title="Criar conta de cliente"
      lead="Com a conta você abre solicitações de manutenção e acompanha cada equipamento."
      wide
    >
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />

        <fieldset>
          <legend>Quem é o cliente</legend>
          <CustomerKindField value={kind} onChange={setKind} />
          {company && (
            <div className="field-row">
              <Field
                label={labels.name}
                name="customerName"
                errorPath="customer.name"
                autoComplete="organization"
                errors={errors}
              />
              <Field
                label="Nome fantasia (opcional)"
                name="tradeName"
                errors={errors}
              />
            </div>
          )}
          <DocumentField
            kind={kind}
            label={labels.document}
            name="document"
            errorPath="customer.document"
            hint={
              company ? 'Aceita o CNPJ numérico ou alfanumérico.' : undefined
            }
            errors={errors}
          />
        </fieldset>

        <fieldset>
          <legend>{company ? 'Seus dados de contato' : 'Seus dados'}</legend>
          <div className="field-row">
            <Field
              label="Nome completo"
              name="contactName"
              errorPath="contact.name"
              autoComplete="name"
              errors={errors}
            />
            <PhoneField
              label="Telefone (opcional)"
              name="phone"
              errorPath="contact.phone"
              errors={errors}
            />
          </div>
          <Field
            label="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            errors={errors}
          />
          <NewPasswordField label="Senha" name="password" errors={errors} />
        </fieldset>

        <TermsAcceptance
          acceptedVersion={termsVersion}
          error={errors.termsVersion}
          onChange={setTermsVersion}
        />

        {captcha.widget}
        <SubmitButton pending={form.pending} block>
          Criar conta
        </SubmitButton>
      </form>
      <div className="auth-links">
        <span className="muted">
          Sua empresa já é atendida? Peça um convite à equipe.
        </span>
        <Link to="/entrar">Já tenho conta</Link>
      </div>
    </AuthLayout>
  );
}
