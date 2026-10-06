import { Badge } from '../../components/Badge';
import { legacyStyle } from './rma-styles';

/** Assunto do chamado e, se veio do sistema anterior, o número antigo. */
export function RmaDescription(props: {
  rma: { subject: string; legacyNumber: string | null };
}) {
  return (
    <>
      {props.rma.subject}
      {props.rma.legacyNumber && (
        <span className="page-header-badge">
          <Badge status={legacyStyle(props.rma.legacyNumber)} />
        </span>
      )}
    </>
  );
}
