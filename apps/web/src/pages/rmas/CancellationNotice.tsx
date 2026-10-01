import type { PortalRmaCancellationView } from '@central/contracts';
import { Alert } from '../../components/feedback';
import { formatDateTime } from '../../lib/format';

/**
 * Mesmo aviso na equipe e no portal: o motivo foi enviado ao solicitante.
 * Só a equipe vê quem cancelou (RN11).
 */
export function CancellationNotice(props: {
  cancellation: PortalRmaCancellationView & {
    cancelledBy?: { name: string } | null;
  };
}) {
  const { cancellation } = props;
  const by = cancellation.cancelledBy
    ? ` por ${cancellation.cancelledBy.name}`
    : '';
  return (
    <Alert tone="warning">
      <strong>
        Cancelado em {formatDateTime(cancellation.cancelledAt)}
        {by}.
      </strong>{' '}
      Motivo: {cancellation.reason}
    </Alert>
  );
}
