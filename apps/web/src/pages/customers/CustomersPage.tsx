import {
  createCustomerSchema,
  type CustomerKind,
  type CustomerSummary,
  type CustomerView,
} from '@central/contracts';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import {
  CustomerKindField,
  customerKindLabels,
} from '../../components/CustomerKindField';
import { FormAlert } from '../../components/feedback';
import { DocumentField, PhoneField } from '../../components/masked-fields';
import { SearchInput } from '../../components/filters';
import { PagedResults } from '../../components/PagedResults';
import { Field, PageHeader, SubmitButton } from '../../components/ui';
import { formatDocument } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/customers';

/**
 * Cadastro pela equipe: o contato principal recebe por e-mail o acesso ao
 * portal, com senha provisória trocada no primeiro acesso.
 */
function NewCustomerForm() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<CustomerKind>('pessoa_juridica');
  const labels = customerKindLabels(kind);
  const { company } = labels;
  const form = useSchemaForm({
    schema: createCustomerSchema,
    read: (data) => ({
      customer: {
        kind,
        name: text(data, 'name'),
        tradeName: company ? text(data, 'tradeName') : undefined,
        document: text(data, 'document') ?? '',
      },
      contact: {
        // Pessoa física: o contato principal é o próprio cliente.
        name: company ? text(data, 'contactName') : text(data, 'name'),
        email: text(data, 'email'),
        phone: text(data, 'phone'),
      },
    }),
    submit: (body) => post<CustomerView>(PATH, body),
    onSuccess: (customer) => void navigate(`/clientes/${customer.id}`),
  });
  const errors = form.fieldErrors;

  return (
    <section className="card">
      <h2>Novo cliente</h2>
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />
        <fieldset>
          <legend>Cliente</legend>
          <CustomerKindField value={kind} onChange={setKind} />
          <div className="field-row">
            <Field
              label={labels.name}
              name="name"
              errorPath="customer.name"
              errors={errors}
            />
            {company && (
              <Field
                label="Nome fantasia (opcional)"
                name="tradeName"
                errorPath="customer.tradeName"
                errors={errors}
              />
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
          </div>
        </fieldset>
        <fieldset>
          <legend>Acesso ao portal</legend>
          <p className="muted">
            O e-mail recebe o acesso ao portal com uma senha provisória, que o
            cliente troca no primeiro acesso.
          </p>
          <div className="field-row">
            {company && (
              <Field
                label="Nome do contato"
                name="contactName"
                errorPath="contact.name"
                errors={errors}
              />
            )}
            <Field
              label="E-mail"
              name="email"
              errorPath="contact.email"
              type="email"
              inputMode="email"
              errors={errors}
            />
            <PhoneField
              label="Telefone (opcional)"
              name="phone"
              errorPath="contact.phone"
              errors={errors}
            />
          </div>
        </fieldset>
        <div className="actions">
          <SubmitButton pending={form.pending}>Cadastrar cliente</SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function CustomersPage() {
  const { data: account } = useSession();
  const list = usePagedList<CustomerSummary, { search: string }>(PATH, {
    search: '',
  });
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack">
      <PageHeader
        title="Clientes"
        actions={
          hasPermission(account, 'customers.write') && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreating((open) => !open)}
            >
              {creating ? 'Fechar' : 'Novo cliente'}
              {creating ? (
                <X size={20} aria-hidden />
              ) : (
                <Plus size={20} aria-hidden />
              )}
            </button>
          )
        }
      />
      {creating && <NewCustomerForm />}
      <section className="panel">
        <div className="panel-header">
          <h2>Clientes cadastrados</h2>
          <div className="panel-tools">
            <SearchInput
              label="Buscar por nome ou documento"
              value={list.filters.search}
              onChange={(search) => list.setFilter({ search })}
            />
          </div>
        </div>
        <PagedResults list={list} emptyMessage="Nenhum cliente encontrado.">
          {(customers) => (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <Link to={`/clientes/${customer.id}`}>
                        {customer.name}
                      </Link>
                      {customer.tradeName && (
                        <span className="sub">{customer.tradeName}</span>
                      )}
                    </td>
                    <td>{formatDocument(customer.document)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PagedResults>
      </section>
    </div>
  );
}
