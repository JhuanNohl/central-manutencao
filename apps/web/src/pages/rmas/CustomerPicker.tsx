import type { CustomerSummary, CustomerView, Page } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { get, toQuery } from '../../api/client';
import { QueryError } from '../../components/feedback';
import { SearchInput } from '../../components/filters';
import { formatDocument } from '../../lib/format';

const MIN_SEARCH_LENGTH = 2;
const RESULTS_SHOWN = 8;

export interface PickedCustomer {
  customer: CustomerView;
  contactId: string;
}

/**
 * Escolha do cliente e do solicitante na abertura pela equipe (RN01).
 * Usa o cadastro existente; clientes novos entram pela tela de Clientes.
 */
export function CustomerPicker(props: {
  value: PickedCustomer | null;
  onChange: (value: PickedCustomer | null) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const term = search.trim();

  const results = useQuery({
    queryKey: ['/customers', 'picker', term],
    queryFn: () =>
      get<Page<CustomerSummary>>(
        `/customers${toQuery({ search: term, pageSize: RESULTS_SHOWN })}`,
      ),
    enabled: term.length >= MIN_SEARCH_LENGTH && !customerId,
  });
  const detail = useQuery({
    queryKey: ['/customers', customerId],
    queryFn: () => get<CustomerView>(`/customers/${customerId}`),
    enabled: customerId !== null,
  });

  // Ao escolher o cliente, o primeiro contato vira o solicitante sugerido.
  const loaded = detail.data;
  const { value, onChange } = props;
  useEffect(() => {
    if (!loaded || value?.customer.id === loaded.id) return;
    const [first] = loaded.contacts;
    onChange(first ? { customer: loaded, contactId: first.id } : null);
  }, [loaded, value, onChange]);

  if (customerId) {
    const customer = detail.data;
    return (
      <fieldset>
        <legend>Cliente</legend>
        {detail.isError && <QueryError error={detail.error} />}
        {customer && (
          <>
            <p>
              <span className="strong">{customer.name}</span>
              <span className="sub">{formatDocument(customer.document)}</span>
            </p>
            {customer.contacts.length === 0 ? (
              <p className="error">
                Este cliente não tem contatos. Cadastre um contato na tela do
                cliente para receber os avisos.
              </p>
            ) : (
              <div className="field">
                <label htmlFor={`${id}-contact`}>Solicitante</label>
                <select
                  id={`${id}-contact`}
                  value={props.value?.contactId ?? ''}
                  onChange={(e) =>
                    props.onChange({ customer, contactId: e.target.value })
                  }
                >
                  {customer.contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name} · {contact.email}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  O solicitante recebe os avisos do atendimento.
                </span>
              </div>
            )}
          </>
        )}
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setCustomerId(null);
              props.onChange(null);
            }}
          >
            Trocar cliente
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset>
      <legend>Cliente</legend>
      <SearchInput
        label="Buscar cliente por nome ou CNPJ/CPF"
        value={search}
        onChange={setSearch}
      />
      {results.isError && <QueryError error={results.error} />}
      {results.data && (
        <ul className="pick-list" aria-label="Clientes encontrados">
          {results.data.items.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="pick-option"
                onClick={() => setCustomerId(customer.id)}
              >
                <span className="strong">{customer.name}</span>
                <span className="sub">{formatDocument(customer.document)}</span>
              </button>
            </li>
          ))}
          {results.data.items.length === 0 && (
            <li className="muted">Nenhum cliente encontrado.</li>
          )}
        </ul>
      )}
    </fieldset>
  );
}
