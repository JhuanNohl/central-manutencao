import type { PortalRmaCancellationView } from '@central/contracts';
import { Alert } from '../../components/feedback';
import { formatDateTime } from '../../lib/format';
import { CONVERSATION_ANCHOR } from './RmaConversation';

/**
 * Mesmo aviso na equipe e no portal: o motivo foi enviado ao solicitante.
 * Só a equipe vê quem cancelou (RN11). Com equipamentos na fábrica, aponta
 * a conversa, onde cliente e equipe combinam a devolução.
 */
export function CancellationNotice(props: {
  cancellation: PortalRmaCancellationView & {
    cancelledBy?: { name: string } | null;
  };
  /** Algum equipamento já chegou à fábrica e volta ao cliente. */
  returning: boolean;
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
      {props.returning && (
        <>
          {' '}
          Os equipamentos que estavam na fábrica estão em processo de devolução.{' '}
          <a href={`#${CONVERSATION_ANCHOR}`}>Combine pela conversa</a>.
        </>
      )}
    </Alert>
  );
}
