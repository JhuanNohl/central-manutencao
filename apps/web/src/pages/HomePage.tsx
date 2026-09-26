import { isStaffRole, type Permission } from '@central/contracts';
import {
  ClipboardList,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { hasPermission, useSession } from '../auth/session';
import { PageHeader } from '../components/ui';
import { EmailVerificationNotice } from './AccountPage';

interface Shortcut {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  permission: Permission;
}

const STAFF_SHORTCUTS: Shortcut[] = [
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

/** Espaço reservado para um fluxo que chega em uma entrega futura. */
function UpcomingSection(props: {
  icon: LucideIcon;
  title: string;
  children: string;
}) {
  const Icon = props.icon;
  return (
    <section className="empty-state">
      <span className="icon-square" aria-hidden>
        <Icon size={28} />
      </span>
      <div>
        <h2>{props.title}</h2>
        <p>{props.children}</p>
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
        />
        <EmailVerificationNotice />
        <UpcomingSection icon={ClipboardList} title="Meus atendimentos">
          Em breve você poderá abrir solicitações de manutenção (RMA) com vários
          equipamentos, fotos e documentação, e acompanhar cada item até
          recebê-lo de volta.
        </UpcomingSection>
      </div>
    );
  }

  const shortcuts = STAFF_SHORTCUTS.filter((item) =>
    hasPermission(account, item.permission),
  );
  return (
    <div className="stack">
      <PageHeader
        title="Visão geral"
        description="Acompanhe os atendimentos e os prazos de manutenção."
      />
      <UpcomingSection icon={Wrench} title="Fila de manutenção">
        A fila de RMAs e itens, com filtros por etapa, responsável e prazo,
        chega com a entrega E1 (abertura até recebimento).
      </UpcomingSection>
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
