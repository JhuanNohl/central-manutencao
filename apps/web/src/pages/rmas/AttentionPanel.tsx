import type { Page, RmaSummary } from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, ClockAlert, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { get, toQuery } from '../../api/client';
import type { StatusStyle } from '../../components/Badge';
import { QueryError } from '../../components/feedback';
import { rmaLabel } from './rma-styles';
import { ATTENTION_QUEUE_PATH, RMAS_PATH } from './RmasPage';
import { slaRemainingLabel } from './sla-remaining';

const ATTENTION_LIMIT = 5;

type AttentionReason = 'atrasado' | 'vence_em_breve' | 'sem_responsavel';

const ATTENTION_STYLES: Record<AttentionReason, StatusStyle> = {
  atrasado: { label: 'Prazo vencido', tone: 'danger', icon: CircleAlert },
  vence_em_breve: {
    label: 'Prazo perto do fim',
    tone: 'warning',
    icon: ClockAlert,
  },
  sem_responsavel: {
    label: 'Chamado sem responsável',
    tone: 'neutral',
    icon: UserRound,
  },
};

/**
 * A API só devolve chamados com prazo em risco ou sem responsável; quando
 * há os dois, o prazo é o motivo mostrado.
 */
function attentionReason(rma: RmaSummary): AttentionReason {
  const status = rma.sla?.status;
  if (status === 'atrasado' || status === 'vence_em_breve') return status;
  return 'sem_responsavel';
}

function AttentionRow({ rma }: { rma: RmaSummary }) {
  const style = ATTENTION_STYLES[attentionReason(rma)];
  const Icon = style.icon;
  return (
    <li
      className={`attention-row attention-${style.tone} accent-${style.tone}`}
    >
      <Icon size={22} aria-hidden />
      <div className="attention-body">
        <strong className="attention-title">{style.label}</strong>
        <span className="sub">
          {rmaLabel(rma.number)} · {rma.customer.name}
          {rma.sla && ` · ${slaRemainingLabel(rma.sla.dueAt)}`}
        </span>
      </div>
      <Link
        to={`/chamados/${rma.number}`}
        className="more-link"
        aria-label={`Abrir chamado ${rmaLabel(rma.number)}`}
      >
        Abrir chamado
        <ArrowRight size={16} aria-hidden />
      </Link>
    </li>
  );
}

/** Chamados que pedem ação agora, do prazo mais apertado para o mais folgado. */
export function AttentionPanel() {
  const query = useQuery({
    queryKey: [RMAS_PATH, 'atencao'],
    queryFn: () =>
      get<Page<RmaSummary>>(
        `${RMAS_PATH}${toQuery({ attention: 'true', pageSize: ATTENTION_LIMIT })}`,
      ),
  });
  if (query.isError) return <QueryError error={query.error} />;
  if (!query.data) return null;

  const { items, total } = query.data;
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>
          Requer atenção
          <span className="count-badge">{total}</span>
        </h2>
        {total > 0 && (
          <div className="panel-tools">
            <Link to={ATTENTION_QUEUE_PATH} className="more-link">
              Ver todos
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        )}
      </div>
      <div className="panel-body">
        {total === 0 ? (
          <p className="muted">
            Nenhum chamado pede ação agora: prazos em dia e todos com
            responsável.
          </p>
        ) : (
          <ul className="attention-list">
            {items.map((rma) => (
              <AttentionRow key={rma.number} rma={rma} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
