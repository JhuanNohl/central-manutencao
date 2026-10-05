import {
  ROLE_LABELS,
  ROLES,
  STAFF_ROLES,
  isStaffRole,
  type AccountStatus,
  type AccountView,
  type StaffRole,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleCheck, MailWarning } from 'lucide-react';
import { useState } from 'react';
import { ApiError, patch, post } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { Badge, type StatusStyle } from '../../components/Badge';
import { FilterTabs, SearchInput } from '../../components/filters';
import { PagedResults } from '../../components/PagedResults';
import { ReasonDialog } from '../../components/ReasonDialog';
import { PageHeader, SelectField } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/accounts';

const STATUS: Record<AccountStatus, StatusStyle> = {
  ativa: { label: 'Ativa', tone: 'success', icon: CircleCheck },
  desativada: { label: 'Desativada', tone: 'neutral', icon: Ban },
};

const EMAIL_PENDING: StatusStyle = {
  label: 'E-mail não confirmado',
  tone: 'warning',
  icon: MailWarning,
};

const STATUS_TABS = [
  { value: '' as const, label: 'Todas' },
  { value: 'ativa' as const, label: 'Ativas' },
  { value: 'desativada' as const, label: 'Desativadas' },
];

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
    { search: string; role: string; status: AccountStatus | '' }
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
      <PageHeader title="Agentes" />

      <section className="panel">
        <div className="panel-header">
          <FilterTabs
            label="Situação da conta"
            value={list.filters.status}
            options={STATUS_TABS}
            onChange={(status) => list.setFilter({ status })}
          />
          <div className="panel-tools">
            <SearchInput
              label="Buscar por nome ou e-mail"
              value={list.filters.search}
              onChange={(search) => list.setFilter({ search })}
            />
            <select
              className="toolbar-select"
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
          </div>
        </div>

        <PagedResults list={list} emptyMessage="Nenhuma conta encontrada.">
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
                      <div className="badges">
                        <Badge status={STATUS[account.status]} />
                        {!account.emailVerified && (
                          <Badge status={EMAIL_PENDING} />
                        )}
                      </div>
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
      </section>

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
