import {
  contactInputSchema,
  type ContactView,
  type CustomerView,
} from '@central/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, CircleMinus, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { get, post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { Badge, type StatusStyle } from '../../components/Badge';
import { customerKindLabels } from '../../components/CustomerKindField';
import {
  Alert,
  FormAlert,
  Loading,
  QueryError,
} from '../../components/feedback';
import { PhoneField } from '../../components/masked-fields';
import { Field, PageHeader, SubmitButton } from '../../components/ui';
import { formatDateTime, formatDocument } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';
import { CustomerNotes } from './CustomerNotes';

const PORTAL_ACCESS: Record<'with' | 'without', StatusStyle> = {
  with: { label: 'Com acesso', tone: 'success', icon: CircleCheck },
  without: { label: 'Sem acesso', tone: 'neutral', icon: CircleMinus },
};

export function CustomerDetailPage() {
  // O parâmetro entra no caminho da API: codificado, não leva a outra rota.
  const id = encodeURIComponent(useParams().id ?? '');
  const { data: account } = useSession();
  const client = useQueryClient();
  const key = ['customer', id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => get<CustomerView>(`/customers/${id}`),
  });

  // Recria o telefone (campo controlado) quando o formulário é limpo.
  const [addedContacts, setAddedContacts] = useState(0);
  const addContact = useSchemaForm({
    schema: contactInputSchema,
    read: (data) => ({
      name: text(data, 'name'),
      email: text(data, 'email'),
      phone: text(data, 'phone'),
    }),
    submit: (body) => post<ContactView>(`/customers/${id}/contacts`, body),
    onSuccess: (_, form) => {
      form.reset();
      setAddedContacts((count) => count + 1);
      void client.invalidateQueries({ queryKey: key });
    },
  });

  /** Cria a conta do contato; a senha provisória vai por e-mail para ele. */
  const grantAccess = useMutation({
    mutationFn: (contactId: string) =>
      post<ContactView>(`/customers/${id}/contacts/${contactId}/access`),
    onSuccess: () => void client.invalidateQueries({ queryKey: key }),
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} />;
  const customer = query.data;
  const labels = customerKindLabels(customer.kind);
  const canInvite = hasPermission(account, 'customers.invite_contact');

  return (
    <div className="stack">
      <PageHeader
        title={customer.name}
        description={customer.tradeName ?? undefined}
        actions={
          <Link to="/clientes" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            Voltar
          </Link>
        }
      />
      <section className="card">
        <dl className="details">
          <dt>Tipo</dt>
          <dd>{labels.kind}</dd>
          <dt>{labels.document}</dt>
          <dd>{formatDocument(customer.document)}</dd>
          <dt>Cadastro</dt>
          <dd>{formatDateTime(customer.createdAt)}</dd>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Contatos</h2>
        </div>
        {(grantAccess.isError || grantAccess.isSuccess) && (
          <div className="panel-body">
            {grantAccess.isError && <QueryError error={grantAccess.error} />}
            {grantAccess.isSuccess && (
              <Alert tone="success">
                Acesso criado para {grantAccess.data.email}. A senha provisória
                vai por e-mail, e a troca é pedida no primeiro acesso.
              </Alert>
            )}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contato</th>
                <th>Portal</th>
                {canInvite && <th aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {customer.contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    {contact.name}
                    <span className="sub">{contact.email}</span>
                    {contact.phone && (
                      <span className="sub">{contact.phone}</span>
                    )}
                  </td>
                  <td>
                    <Badge
                      status={
                        PORTAL_ACCESS[
                          contact.hasPortalAccess ? 'with' : 'without'
                        ]
                      }
                    />
                  </td>
                  {canInvite && (
                    <td>
                      {!contact.hasPortalAccess && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={grantAccess.isPending}
                          onClick={() => grantAccess.mutate(contact.id)}
                        >
                          <KeyRound size={16} aria-hidden />
                          Criar acesso ao portal
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {customer.contacts.length === 0 && (
            <div className="empty">Nenhum contato cadastrado.</div>
          )}
        </div>
      </section>

      <CustomerNotes
        customerId={customer.id}
        canEdit={hasPermission(account, 'customers.write')}
      />

      {hasPermission(account, 'customers.write') && (
        <section className="card">
          <h2>Adicionar contato</h2>
          <form onSubmit={addContact.onSubmit} noValidate>
            <FormAlert message={addContact.formError} />
            <div className="field-row">
              <Field label="Nome" name="name" errors={addContact.fieldErrors} />
              <Field
                label="E-mail"
                name="email"
                type="email"
                inputMode="email"
                errors={addContact.fieldErrors}
              />
              <PhoneField
                key={addedContacts}
                label="Telefone (opcional)"
                name="phone"
                errors={addContact.fieldErrors}
              />
            </div>
            <div className="actions">
              <SubmitButton pending={addContact.pending}>
                Adicionar contato
              </SubmitButton>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
