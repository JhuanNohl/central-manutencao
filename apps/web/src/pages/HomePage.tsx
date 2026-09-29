import {
  isStaffRole,
  type Page,
  type Permission,
  type PortalRmaSummary,
} from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ClipboardList,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
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
import { AttentionPanel } from './rmas/AttentionPanel';
import { NewStaffRmaLink } from './rmas/RmasPage';

interface Shortcut {
  to: string;
  title: string;
  icon: LucideIcon;
  permission: Permission;
}

const STAFF_SHORTCUTS: Shortcut[] = [
  {
    to: '/chamados',
    title: 'Chamados',
    icon: ClipboardList,
    permission: 'rma.read',
  },
  {
    to: '/clientes',
    title: 'Clientes',
    icon: Users,
    permission: 'customers.read',
  },
  {
    to: '/admin/convites',
    title: 'Equipe',
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
      <PageHeader title="Início" actions={<NewStaffRmaLink />} />
      {shortcuts.length > 0 && (
        <nav className="grid-3" aria-label="Atalhos">
          {shortcuts.map(({ to, title, icon: Icon }) => (
            <Link key={to} to={to} className="tile shortcut">
              <span className="icon-square" aria-hidden>
                <Icon size={24} />
              </span>
              <h2>{title}</h2>
              <ArrowRight size={20} aria-hidden />
            </Link>
          ))}
        </nav>
      )}
      {hasPermission(account, 'rma.read') && <AttentionPanel />}
    </div>
  );
}
