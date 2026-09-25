import {
  contactInputSchema,
  type ContactView,
  type CustomerView,
  type InvitationView,
} from '@central/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { get, post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import {
  Badge,
  Field,
  FormAlert,
  Loading,
  PageHeader,
  QueryError,
  SubmitButton,
} from '../../components/ui';
import { formatDateTime, formatDocument } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { data: account } = useSession();
  const client = useQueryClient();
  const key = ['customer', id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => get<CustomerView>(`/customers/${id}`),
  });

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
      void client.invalidateQueries({ queryKey: key });
    },
  });

  const invite = useMutation({
    mutationFn: (contactId: string) =>
      post<InvitationView>(`/customers/${id}/contacts/${contactId}/invitation`),
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} />;
  const customer = query.data;

  return (
    <div className="stack">
      <PageHeader
        title={customer.name}
        description={customer.tradeName ?? undefined}
        actions={
          <Link to="/clientes" className="btn btn-secondary">
            Voltar
          </Link>
        }
      />
      <section className="card">
        <dl className="details">
          <dt>Tipo</dt>
          <dd>
            {customer.kind === 'pessoa_juridica'
              ? 'Pessoa jurídica'
              : 'Pessoa física'}
          </dd>
          <dt>{customer.kind === 'pessoa_juridica' ? 'CNPJ' : 'CPF'}</dt>
          <dd>{formatDocument(customer.document)}</dd>
          <dt>Cadastro</dt>
          <dd>{formatDateTime(customer.createdAt)}</dd>
        </dl>
      </section>

      <section>
        <h2 className="section-title">Contatos</h2>
        {invite.isError && <QueryError error={invite.error} />}
        {invite.isSuccess && (
          <div className="alert alert-success" role="status">
            Convite registrado para {invite.data.email}. O e-mail será enviado
            em instantes.
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contato</th>
                <th>Portal</th>
                {hasPermission(account, 'customers.invite_contact') && (
                  <th aria-label="Ações" />
                )}
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
                    {contact.hasPortalAccess ? (
                      <Badge tone="success">Com acesso</Badge>
                    ) : (
                      <Badge>Sem acesso</Badge>
                    )}
                  </td>
                  {hasPermission(account, 'customers.invite_contact') && (
                    <td>
                      {!contact.hasPortalAccess && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={invite.isPending}
                          onClick={() => invite.mutate(contact.id)}
                        >
                          Convidar ao portal
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
              <Field
                label="Telefone (opcional)"
                name="phone"
                type="tel"
                inputMode="tel"
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
