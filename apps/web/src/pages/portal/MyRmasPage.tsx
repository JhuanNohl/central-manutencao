import type { PortalRmaSummary } from '@central/contracts';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { hasPermission, useSession } from '../../auth/session';
import { PagedResults } from '../../components/PagedResults';
import { PageHeader } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { usePagedList } from '../../lib/paged-list';
import { Badge } from '../../components/Badge';
import { CANCELLED_STYLE, rmaLabel } from '../rmas/rma-styles';
import { StageSummary } from '../rmas/StageSummary';

export const PORTAL_RMAS_PATH = '/portal/rmas';

/** Ação principal do portal; some para quem não pode abrir atendimentos. */
export function NewRmaLink() {
  const { data: account } = useSession();
  if (!hasPermission(account, 'rma.own.create')) return null;
  return (
    <Link to="/atendimentos/novo" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      Novo atendimento
    </Link>
  );
}

/** Atendimentos do próprio cliente, com a etapa de cada equipamento. */
export function MyRmasPage() {
  const list = usePagedList<PortalRmaSummary, Record<string, never>>(
    PORTAL_RMAS_PATH,
    {},
  );
  return (
    <div>
      <PageHeader title="Meus equipamentos" actions={<NewRmaLink />} />
      <section className="panel">
        <PagedResults
          list={list}
          emptyMessage="Você ainda não abriu atendimentos."
        >
          {(rmas) => <PortalRmasTable rmas={rmas} />}
        </PagedResults>
      </section>
    </div>
  );
}

export function PortalRmasTable({ rmas }: { rmas: PortalRmaSummary[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Atendimento</th>
          <th className="col-wide">Equipamentos</th>
          <th>Situação</th>
          <th>Aberto em</th>
          <th>Atualizado em</th>
        </tr>
      </thead>
      <tbody>
        {rmas.map((rma) => (
          <tr key={rma.number}>
            <td className="nowrap">
              <Link to={`/atendimentos/${rma.number}`} className="strong">
                {rmaLabel(rma.number)}
              </Link>
              {rma.legacyNumber && (
                <span className="sub">nº anterior {rma.legacyNumber}</span>
              )}
            </td>
            <td>
              <Link to={`/atendimentos/${rma.number}`}>{rma.subject}</Link>
            </td>
            <td>
              {rma.cancellation ? (
                <Badge status={CANCELLED_STYLE} />
              ) : (
                <StageSummary stages={rma.stages} itemCount={rma.itemCount} />
              )}
            </td>
            <td className="nowrap">{formatDateTime(rma.createdAt)}</td>
            <td className="nowrap">{formatDateTime(rma.updatedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
