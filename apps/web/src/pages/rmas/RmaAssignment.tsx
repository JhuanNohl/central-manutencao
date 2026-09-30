import {
  RMA_PRIORITIES,
  RMA_PRIORITY_LABELS,
  type AssigneeOption,
  type RmaDetail,
  type RmaPriority,
  type RmaPriorityView,
} from '@central/contracts';
import { useQuery } from '@tanstack/react-query';
import { UserRoundCheck, UserRoundMinus } from 'lucide-react';
import { errorMessage, get, patch } from '../../api/client';
import { hasPermission, useSession } from '../../auth/session';
import { Alert } from '../../components/feedback';
import { useAssignRma, useRmaOperation } from './rma-operations';
import { rmaLabel } from './rma-styles';
import { RMAS_PATH } from './RmasPage';

const ASSIGNEES_STALE_MS = 5 * 60_000;

function InlineError({ error }: { error: unknown }) {
  const message = errorMessage(error);
  if (!message) return null;
  return (
    <span className="inline-error" role="alert">
      {message}
    </span>
  );
}

/** Um clique para quem opera chamados assumir o que está vendo. */
export function AssumeRmaButton(props: {
  number: number;
  assignee: { id: string } | null;
}) {
  const { data: account } = useSession();
  const assign = useAssignRma(props.number);
  if (!account || !hasPermission(account, 'rma.write')) return null;
  if (props.assignee?.id === account.id) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={assign.isPending}
        aria-label={`Assumir o chamado ${rmaLabel(props.number)}`}
        onClick={() =>
          assign.mutate({
            assigneeId: account.id,
            expectedAssigneeId: props.assignee?.id ?? null,
          })
        }
      >
        <UserRoundCheck size={16} aria-hidden />
        Assumir
      </button>
      <InlineError error={assign.error} />
    </>
  );
}

/** Responsável atual, com as ações de assumir ou deixar o chamado. */
export function AssignmentNotice({ rma }: { rma: RmaDetail }) {
  const { data: account } = useSession();
  const release = useAssignRma(rma.number);
  const open = rma.closedAt === null;
  const mine = rma.assignee?.id === account?.id;
  const canRelease = open && mine && hasPermission(account, 'rma.write');

  return (
    <Alert tone={rma.assignee ? 'success' : 'warning'}>
      <div className="alert-row">
        <span>
          {rma.assignee ? (
            <>
              Chamado atribuído a{' '}
              <strong>{mine ? 'você' : rma.assignee.name}</strong>.
            </>
          ) : (
            'Chamado sem responsável.'
          )}
        </span>
        {open && (
          <div className="actions">
            <AssumeRmaButton number={rma.number} assignee={rma.assignee} />
            {canRelease && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={release.isPending}
                onClick={() =>
                  release.mutate({
                    assigneeId: null,
                    expectedAssigneeId: rma.assignee?.id ?? null,
                  })
                }
              >
                <UserRoundMinus size={16} aria-hidden />
                Deixar o chamado
              </button>
            )}
            <InlineError error={release.error} />
          </div>
        )}
      </div>
    </Alert>
  );
}

/** Transferência para qualquer conta ativa que opera chamados. */
export function AssigneeSelect({ rma }: { rma: RmaDetail }) {
  const assign = useAssignRma(rma.number);
  const options = useQuery({
    queryKey: [RMAS_PATH, 'assignees'],
    queryFn: () => get<AssigneeOption[]>(`${RMAS_PATH}/assignees`),
    staleTime: ASSIGNEES_STALE_MS,
  });
  const current = rma.assignee;
  // Um responsável desativado continua visível até alguém trocá-lo.
  const choices = [
    ...(current && !options.data?.some((o) => o.id === current.id)
      ? [current]
      : []),
    ...(options.data ?? []),
  ];
  return (
    <>
      <select
        className="toolbar-select"
        aria-label="Responsável"
        value={current?.id ?? ''}
        disabled={assign.isPending || !options.data}
        onChange={(e) =>
          assign.mutate({
            assigneeId: e.target.value || null,
            expectedAssigneeId: current?.id ?? null,
          })
        }
      >
        <option value="">Sem responsável</option>
        {choices.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <InlineError error={assign.error} />
    </>
  );
}

export function PrioritySelect({ rma }: { rma: RmaDetail }) {
  const change = useRmaOperation((priority: RmaPriority) =>
    patch<RmaPriorityView>(`${RMAS_PATH}/${rma.number}/priority`, {
      priority,
    }),
  );
  return (
    <>
      <select
        className="toolbar-select"
        aria-label="Prioridade"
        value={rma.priority}
        disabled={change.isPending}
        onChange={(e) => change.mutate(e.target.value as RmaPriority)}
      >
        {RMA_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {RMA_PRIORITY_LABELS[priority]}
          </option>
        ))}
      </select>
      <InlineError error={change.error} />
    </>
  );
}
