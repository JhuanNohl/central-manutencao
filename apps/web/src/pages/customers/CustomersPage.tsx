import {
  customerInputSchema,
  type CustomerKind,
  type CustomerSummary,
  type CustomerView,
  type Page,
} from '@central/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { get, post, toQuery } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import {
  CustomerKindField,
  customerKindLabels,
} from '../../components/CustomerKindField';
import {
  Field,
  FormAlert,
  PageHeader,
  Pagination,
  QueryError,
  SubmitButton,
} from '../../components/ui';
import { formatDocument } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';

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
    submit: (body) => post<CustomerView>('/customers', body),
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
  const [filters, setFilters] = useState({ search: '', page: 1 });
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ['customers', filters],
    queryFn: () =>
      get<Page<CustomerSummary>>(
        `/customers${toQuery({ ...filters, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Clientes"
        actions={
          hasPermission(account, 'customers.write') && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreating((v) => !v)}
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
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value, page: 1 })}
          />
        </div>
        {query.isError && <QueryError error={query.error} />}
        {query.data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((customer) => (
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
              {query.data.items.length === 0 && (
                <div className="empty">Nenhum cliente encontrado.</div>
              )}
            </div>
            <Pagination
              {...query.data}
              onPage={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </>
        )}
      </section>
    </div>
  );
}
