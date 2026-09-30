import type { RmaCancellationView } from '@central/contracts';
import { Alert } from '../../components/feedback';
import { formatDateTime } from '../../lib/format';

/** Mesmo aviso na equipe e no portal: o motivo foi enviado ao solicitante. */
export function CancellationNotice(props: {
  cancellation: RmaCancellationView;
}) {
  return (
    <Alert tone="warning">
      <strong>
        Cancelado em {formatDateTime(props.cancellation.cancelledAt)}.
      </strong>{' '}
      Motivo: {props.cancellation.reason}
    </Alert>
  );
}
