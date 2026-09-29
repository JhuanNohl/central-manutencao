import type { ItemSlaView } from '@central/contracts';
import { Badge } from '../../components/Badge';
import { formatDateTime } from '../../lib/format';
import { SLA_STYLES } from './rma-styles';
import { slaRemainingLabel } from './sla-remaining';

/** Situação do prazo com vencimento e saldo por extenso, não só a cor. */
export function ItemSla({ sla }: { sla: ItemSlaView }) {
  return (
    <>
      <Badge status={SLA_STYLES[sla.status]} />
      {sla.dueAt ? (
        <span className="sub">
          Vence em {formatDateTime(sla.dueAt)} · {slaRemainingLabel(sla.dueAt)}
        </span>
      ) : (
        <span className="sub">
          Começa quando o equipamento chegar à fábrica
        </span>
      )}
    </>
  );
}
