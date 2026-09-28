import {
  isStaffRole,
  type Page,
  type Permission,
  type PortalRmaSummary,
} from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { get, toQuery } from '../api/client';
import { hasPermission, useSession } from '../auth/session';
import { QueryError } from '../components/feedback';
import { PageHeader } from '../components/ui';
import { EmailVerificationNotice } from './AccountPage';
import {
  NewRmaLink,
  PORTAL_RMAS_PATH,
  PortalRmasTable,
} from './portal/MyRmasPage';

interface Shortcut {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  permission: Permission;
}

const STAFF_SHORTCUTS: Shortcut[] = [
  {
    to: '/chamados',
    title: 'Chamados',
    description:
      'Fila de RMAs com etapa de cada equipamento, cliente, nota fiscal e responsável.',
    icon: ClipboardList,
    permission: 'rma.read',
  },
  {
    to: '/clientes',
    title: 'Clientes',
    description:
      'Cadastro de clientes, contatos e convites de acesso ao portal.',
    icon: Users,
    permission: 'customers.read',
  },
  {
    to: '/admin/convites',
    title: 'Equipe',
    description: 'Convide agentes e defina papéis e permissões.',
    icon: UserPlus,
    permission: 'accounts.manage',
  },
];

const RECENT_RMAS = 5;

/** Atendimentos mais recentes do cliente, ou o convite para abrir o primeiro. */
function RecentRmas() {
  const query = useQuery({
    queryKey: [PORTAL_RMAS_PATH, 'recentes'],
    queryFn: () =>
      get<Page<PortalRmaSummary>>(
        `${PORTAL_RMAS_PATH}${toQuery({ pageSize: RECENT_RMAS })}`,
      ),
  });
  if (query.isError) return <QueryError error={query.error} />;
  if (!query.data) return null;
  if (query.data.total === 0) {
    return (
      <section className="empty-state">
        <span className="icon-square" aria-hidden>
          <ClipboardList size={28} />
        </span>
        <div>
          <h2>Meus atendimentos</h2>
          <p>
            Abra uma solicitação de manutenção com um ou vários equipamentos,
            fotos e a nota fiscal, e acompanhe cada item até recebê-lo de volta.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          <ClipboardList size={20} aria-hidden className="inline-icon" />
          Meus atendimentos
        </h2>
        <div className="panel-tools">
          {query.data.total > RECENT_RMAS && (
            <Link to="/atendimentos">Ver todos ({query.data.total})</Link>
          )}
        </div>
      </div>
      <div className="table-wrap">
        <PortalRmasTable rmas={query.data.items} />
      </div>
    </section>
  );
}

export function HomePage() {
  const { data: account } = useSession();
  if (!account) return null;
  const firstName = account.name.split(' ')[0];

  if (!isStaffRole(account.role)) {
    return (
      <div className="stack">
        <PageHeader
          title={`Olá, ${firstName}`}
          description={account.customer?.name}
          actions={<NewRmaLink />}
        />
        <EmailVerificationNotice />
        <RecentRmas />
      </div>
    );
  }

  const shortcuts = STAFF_SHORTCUTS.filter((item) =>
    hasPermission(account, item.permission),
  );
  return (
    <div className="stack">
      <PageHeader title="Início" />
      {shortcuts.length > 0 && (
        <div className="grid-2">
          {shortcuts.map(({ to, title, description, icon: Icon }) => (
            <Link key={to} to={to} className="tile">
              <span className="icon-square" aria-hidden>
                <Icon size={28} />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
