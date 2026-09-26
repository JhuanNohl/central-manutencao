import {
  customerInputSchema,
  type CustomerKind,
  type CustomerSummary,
  type CustomerView,
} from '@central/contracts';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import {
  CustomerKindField,
  customerKindLabels,
} from '../../components/CustomerKindField';
import { PagedResults } from '../../components/PagedResults';
import {
  Field,
  FormAlert,
  PageHeader,
  SubmitButton,
} from '../../components/ui';
import { formatDocument } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/customers';

function NewCustomerForm() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<CustomerKind>('pessoa_juridica');
  const labels = customerKindLabels(kind);
  const form = useSchemaForm({
    schema: customerInputSchema,
    read: (data) => ({
      kind,
      name: text(data, 'name'),
      tradeName: labels.company ? text(data, 'tradeName') : undefined,
      document: text(data, 'document') ?? '',
    }),
    submit: (body) => post<CustomerView>(PATH, body),
    onSuccess: (customer) => void navigate(`/clientes/${customer.id}`),
  });

  return (
    <section className="card">
      <h2>Novo cliente</h2>
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />
        <CustomerKindField value={kind} onChange={setKind} />
        <div className="field-row">
          <Field label={labels.name} name="name" errors={form.fieldErrors} />
          {labels.company && (
            <Field
              label="Nome fantasia (opcional)"
              name="tradeName"
              errors={form.fieldErrors}
            />
          )}
          <Field
            label={labels.document}
            name="document"
            errors={form.fieldErrors}
          />
        </div>
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
            </button>
          )
        }
      />
      {creating && <NewCustomerForm />}
      <section>
        <div className="toolbar">
          <input
            type="search"
            placeholder="Buscar por nome ou documento"
            aria-label="Buscar"
            value={list.filters.search}
            onChange={(e) => list.setFilter({ search: e.target.value })}
          />
        </div>
        <PagedResults
          query={list.query}
          emptyMessage="Nenhum cliente encontrado."
          onPage={list.setPage}
        >
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
