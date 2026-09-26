import {
  ACCOUNT_STATUSES,
  ROLE_LABELS,
  ROLES,
  STAFF_ROLES,
  isStaffRole,
  type AccountView,
  type StaffRole,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, patch, post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { PagedResults } from '../../components/PagedResults';
import { ReasonDialog } from '../../components/ReasonDialog';
import { Badge, PageHeader, SelectField } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/accounts';

type ActionKind = 'role' | 'disable' | 'enable';
type Action = { kind: ActionKind; account: AccountView };

const ACTION_COPY: Record<
  ActionKind,
  {
    title: (name: string) => string;
    confirmLabel: string;
    description?: string;
    danger?: boolean;
  }
> = {
  role: { title: (name) => `Papel de ${name}`, confirmLabel: 'Salvar papel' },
  disable: {
    title: (name) => `Desativar ${name}?`,
    confirmLabel: 'Desativar',
    description:
      'A pessoa perde o acesso imediatamente e todas as sessões são encerradas.',
    danger: true,
  },
  enable: { title: (name) => `Reativar ${name}?`, confirmLabel: 'Reativar' },
};

function useAccountAction(onDone: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      action: Action;
      reason: string;
      role?: StaffRole;
    }) => {
      const { kind, account } = input.action;
      return kind === 'role'
        ? patch(`${PATH}/${account.id}/role`, {
            role: input.role,
            reason: input.reason,
          })
        : post(`${PATH}/${account.id}/${kind}`, { reason: input.reason });
    },
    onSuccess: () => {
      onDone();
      void client.invalidateQueries({ queryKey: [PATH] });
    },
  });
}

export function AccountsPage() {
  const { data: me } = useSession();
  const canManage = hasPermission(me, 'accounts.manage');
  const list = usePagedList<
    AccountView,
    Record<'search' | 'role' | 'status', string>
  >(PATH, { search: '', role: '', status: '' });
  const [action, setAction] = useState<Action | null>(null);
  const mutation = useAccountAction(() => setAction(null));
  const copy = action ? ACTION_COPY[action.kind] : null;

  const close = () => {
    setAction(null);
    mutation.reset();
  };

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
          value={list.filters.search}
          onChange={(e) => list.setFilter({ search: e.target.value })}
        />
        <select
          aria-label="Papel"
          value={list.filters.role}
          onChange={(e) => list.setFilter({ role: e.target.value })}
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
          value={list.filters.status}
          onChange={(e) => list.setFilter({ status: e.target.value })}
        >
          <option value="">Todas as situações</option>
          {ACCOUNT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === 'ativa' ? 'Ativas' : 'Desativadas'}
            </option>
          ))}
        </select>
      </div>

      <PagedResults
        query={list.query}
        emptyMessage="Nenhuma conta encontrada."
        onPage={list.setPage}
      >
        {(accounts) => (
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
              {accounts.map((account) => (
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
                    <AccountStatusBadges account={account} />
                  </td>
                  <td>{formatDateTime(account.lastLoginAt)}</td>
                  {canManage && (
                    <td>
                      {account.id !== me?.id && (
                        <AccountActions
                          account={account}
                          onAction={(kind) => setAction({ kind, account })}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PagedResults>

      <ReasonDialog
        open={action !== null}
        title={action && copy ? copy.title(action.account.name) : ''}
        description={copy?.description}
        confirmLabel={copy?.confirmLabel ?? ''}
        danger={copy?.danger}
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

function AccountStatusBadges({ account }: { account: AccountView }) {
  return (
    <>
      {account.status === 'ativa' ? (
        <Badge tone="success">Ativa</Badge>
      ) : (
        <Badge tone="danger">Desativada</Badge>
      )}{' '}
      {!account.emailVerified && (
        <Badge tone="warning">E-mail não confirmado</Badge>
      )}
    </>
  );
}

function AccountActions(props: {
  account: AccountView;
  onAction: (kind: ActionKind) => void;
}) {
  const active = props.account.status === 'ativa';
  return (
    <div className="actions">
      {isStaffRole(props.account.role) && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => props.onAction('role')}
        >
          Papel
        </button>
      )}
      <button
        type="button"
        className={`btn btn-sm ${active ? 'btn-danger' : 'btn-secondary'}`}
        onClick={() => props.onAction(active ? 'disable' : 'enable')}
      >
        {active ? 'Desativar' : 'Reativar'}
      </button>
    </div>
  );
}
