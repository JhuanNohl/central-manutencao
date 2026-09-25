import { isStaffRole } from '@central/contracts';
import { Link } from 'react-router';
import { hasPermission, useSession } from '../auth/session';
import { PageHeader } from '../components/ui';
import { EmailVerificationNotice } from './AccountPage';

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
        <section className="placeholder">
          <h2>Meus atendimentos</h2>
          <p>
            Em breve você poderá abrir solicitações de manutenção (RMA) com
            vários equipamentos, fotos e documentação, e acompanhar cada item
            até recebê-lo de volta.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title={`Olá, ${firstName}`} description="Painel da equipe" />
      <section className="placeholder">
        <h2>Fila de manutenção</h2>
        <p>
          A fila de RMAs e itens, com filtros por etapa, responsável e prazo,
          chega com a entrega E1 (abertura até recebimento).
        </p>
      </section>
      <div className="grid-2">
        {hasPermission(account, 'customers.read') && (
          <Link to="/clientes" className="card card-link">
            <h2>Clientes</h2>
            <p className="muted">
              Cadastro de clientes, contatos e convites de acesso ao portal.
            </p>
          </Link>
        )}
        {hasPermission(account, 'accounts.manage') && (
          <Link to="/admin/convites" className="card card-link">
            <h2>Equipe</h2>
            <p className="muted">
              Convide agentes e defina papéis e permissões.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
