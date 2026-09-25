import {
  ACCOUNT_STATUSES,
  ROLE_LABELS,
  ROLES,
  STAFF_ROLES,
  isStaffRole,
  type AccountView,
  type Page,
  type StaffRole,
} from '@central/contracts';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, get, patch, post, toQuery } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { ReasonDialog } from '../../components/ReasonDialog';
import {
  Badge,
  PageHeader,
  Pagination,
  QueryError,
  SelectField,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';

type Action =
  | { kind: 'role'; account: AccountView }
  | { kind: 'disable'; account: AccountView }
  | { kind: 'enable'; account: AccountView };

export function AccountsPage() {
  const { data: me } = useSession();
  const canManage = hasPermission(me, 'accounts.manage');
  const client = useQueryClient();
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
    page: 1,
  });
  const [action, setAction] = useState<Action | null>(null);

  const query = useQuery({
    queryKey: ['accounts', filters],
    queryFn: () =>
      get<Page<AccountView>>(
        `/accounts${toQuery({ ...filters, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: ({
      action,
      reason,
      role,
    }: {
      action: Action;
      reason: string;
      role?: StaffRole;
    }) => {
      const id = action.account.id;
      if (action.kind === 'role')
        return patch(`/accounts/${id}/role`, { role, reason });
      return post(`/accounts/${id}/${action.kind}`, { reason });
    },
    onSuccess: () => {
      setAction(null);
      void client.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const close = () => {
    setAction(null);
    mutation.reset();
  };
  const update = (patchFilters: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patchFilters }));

  return (
    <div>
      <PageHeader
        title="Contas"
        description="Clientes e integrantes da equipe com acesso à Central."
      />
      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar"
          value={filters.search}
          onChange={(event) => update({ search: event.target.value })}
        />
        <select
          aria-label="Papel"
          value={filters.role}
          onChange={(e) => update({ role: e.target.value })}
        >
          <option value="">Todos os papéis</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <select
          aria-label="Situação"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">Todas as situações</option>
          {ACCOUNT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === 'ativa' ? 'Ativas' : 'Desativadas'}
            </option>
          ))}
        </select>
      </div>

      {query.isError && <QueryError error={query.error} />}
      {query.data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th>Situação</th>
                  <th>Último acesso</th>
                  {canManage && <th aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((account) => (
                  <tr key={account.id}>
                    <td>
                      {account.name}
                      <span className="sub">{account.email}</span>
                      {account.customer && (
                        <span className="sub">{account.customer.name}</span>
                      )}
                    </td>
                    <td>{ROLE_LABELS[account.role]}</td>
                    <td>
                      {account.status === 'ativa' ? (
                        <Badge tone="success">Ativa</Badge>
                      ) : (
                        <Badge tone="danger">Desativada</Badge>
                      )}{' '}
                      {!account.emailVerified && (
                        <Badge tone="warning">E-mail não confirmado</Badge>
                      )}
                    </td>
                    <td>{formatDateTime(account.lastLoginAt)}</td>
                    {canManage && (
                      <td>
                        {account.id !== me?.id && (
                          <div className="actions">
                            {isStaffRole(account.role) && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setAction({ kind: 'role', account })
                                }
                              >
                                Papel
                              </button>
                            )}
                            {account.status === 'ativa' ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() =>
                                  setAction({ kind: 'disable', account })
                                }
                              >
                                Desativar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() =>
                                  setAction({ kind: 'enable', account })
                                }
                              >
                                Reativar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {query.data.items.length === 0 && (
              <div className="empty">Nenhuma conta encontrada.</div>
            )}
          </div>
          <Pagination
            {...query.data}
            onPage={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      )}

      <ReasonDialog
        open={action !== null}
        title={
          action?.kind === 'role'
            ? `Papel de ${action.account.name}`
            : action?.kind === 'disable'
              ? `Desativar ${action.account.name}?`
              : `Reativar ${action?.account.name ?? ''}?`
        }
        description={
          action?.kind === 'disable'
            ? 'A pessoa perde o acesso imediatamente e todas as sessões são encerradas.'
            : undefined
        }
        confirmLabel={
          action?.kind === 'role'
            ? 'Salvar papel'
            : action?.kind === 'disable'
              ? 'Desativar'
              : 'Reativar'
        }
        danger={action?.kind === 'disable'}
        pending={mutation.isPending}
        error={
          mutation.error instanceof ApiError ? mutation.error.message : null
        }
        onClose={close}
        onConfirm={(reason, data) =>
          action &&
          mutation.mutate({
            action,
            reason,
            role: data.get('role') as StaffRole,
          })
        }
      >
        {action?.kind === 'role' && (
          <SelectField
            label="Novo papel"
            name="role"
            defaultValue={action.account.role}
            options={STAFF_ROLES.map((role) => ({
              value: role,
              label: ROLE_LABELS[role],
            }))}
          />
        )}
      </ReasonDialog>
    </div>
  );
}
