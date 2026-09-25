import {
  registerRequestSchema,
  type CustomerKind,
  type MeResponse,
} from '@central/contracts';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { useSetSession } from '../../auth/session';
import { Field, FormAlert, SubmitButton } from '../../components/ui';
import { AuthLayout } from '../../layouts/AuthLayout';
import { raw, text, useSchemaForm } from '../../lib/forms';

export function RegisterPage() {
  const setSession = useSetSession();
  const navigate = useNavigate();
  const [kind, setKind] = useState<CustomerKind>('pessoa_juridica');
  const company = kind === 'pessoa_juridica';

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
    }),
    submit: (body) => post<MeResponse>('/auth/register', body),
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
          <div
            className="radio-group"
            role="radiogroup"
            aria-label="Tipo de cliente"
          >
            <label>
              <input
                type="radio"
                name="kind"
                checked={company}
                onChange={() => setKind('pessoa_juridica')}
              />
              Empresa (CNPJ)
            </label>
            <label>
              <input
                type="radio"
                name="kind"
                checked={!company}
                onChange={() => setKind('pessoa_fisica')}
              />
              Pessoa física (CPF)
            </label>
          </div>
          {company && (
            <div className="field-row">
              <Field
                label="Razão social"
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
          <Field
            label={company ? 'CNPJ' : 'CPF'}
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
            <Field
              label="Telefone (opcional)"
              name="phone"
              errorPath="contact.phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
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
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="Pelo menos 10 caracteres. Uma frase fácil de lembrar funciona bem."
            errors={errors}
          />
        </fieldset>

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
