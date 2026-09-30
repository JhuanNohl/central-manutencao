import type { RmaSummary } from '@central/contracts';
import { ArrowRight, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../../components/Badge';
import { formatDateTime } from '../../lib/format';
import {
  CANCELLED_STYLE,
  PRIORITY_STYLES,
  RMA_SLA_STYLES,
  rmaLabel,
} from './rma-styles';
import { slaRemainingLabel } from './sla-remaining';
import { StageSummary } from './StageSummary';

function equipmentCount(count: number): string {
  return count === 1 ? '1 equipamento' : `${count} equipamentos`;
}

/**
 * Chamado na fila; o card inteiro abre o chamado. A faixa lateral repete o
 * tom do prazo em risco, que também aparece por escrito no badge. Sem risco,
 * a faixa verde só aparece no card sob o mouse ou com o foco.
 */
export function RmaCard({ rma }: { rma: RmaSummary }) {
  const path = `/chamados/${rma.number}`;
  const sla = rma.sla ? RMA_SLA_STYLES[rma.sla.status] : null;
  return (
    <article className={`rma-card rma-card-${sla?.tone ?? 'success'}`}>
      <header className="rma-card-header">
        <h2 className="rma-card-title">
          <Link to={path} className="card-link">
            {rmaLabel(rma.number)}
          </Link>{' '}
          · {rma.customer.name}
        </h2>
        <div className="badges">
          {rma.cancellation && <Badge status={CANCELLED_STYLE} />}
          {sla && <Badge status={sla} />}
          <Badge status={PRIORITY_STYLES[rma.priority]} />
        </div>
      </header>
      <p className="rma-card-equipment">
        <strong>{rma.models.join(' · ')}</strong>
        <span className="muted"> · {equipmentCount(rma.itemCount)}</span>
        {rma.invoice && (
          <span className="muted"> · NF {rma.invoice.number}</span>
        )}
      </p>
      <StageSummary stages={rma.stages} itemCount={rma.itemCount} />
      <footer className="rma-card-footer">
        <span className="with-icon">
          <UserRound size={16} aria-hidden />
          {rma.assignee
            ? `Responsável: ${rma.assignee.name}`
            : 'Sem responsável'}
        </span>
        {rma.sla && <span>Prazo: {slaRemainingLabel(rma.sla.dueAt)}</span>}
        <span>Atualizado em {formatDateTime(rma.updatedAt)}</span>
        <Link
          to={path}
          className="more-link"
          aria-label={`Ver chamado ${rmaLabel(rma.number)}`}
        >
          Ver chamado
          <ArrowRight size={16} aria-hidden />
        </Link>
      </footer>
    </article>
  );
}
