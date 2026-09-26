import {
  NOTIFICATION_STATUSES,
  type NotificationStatus,
  type NotificationTemplate,
  type NotificationView,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '../../api/client';
import { PagedResults } from '../../components/PagedResults';
import {
  Badge,
  PageHeader,
  QueryError,
  type BadgeTone,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/admin/notifications';
const REFRESH_MS = 15_000;

const TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  convite: 'Convite',
  redefinicao_senha: 'Redefinição de senha',
  confirmacao_email: 'Confirmação de e-mail',
};

const STATUS: Record<NotificationStatus, { label: string; tone: BadgeTone }> = {
  pendente: { label: 'Pendente', tone: 'info' },
  enviando: { label: 'Enviando', tone: 'warning' },
  enviada: { label: 'Enviada', tone: 'success' },
  falhou: { label: 'Falhou', tone: 'danger' },
};

export function NotificationsPage() {
  const client = useQueryClient();
  const list = usePagedList<NotificationView, { status: string }>(
    PATH,
    { status: 'falhou' },
    { refetchInterval: REFRESH_MS },
  );
  const retry = useMutation({
    mutationFn: (id: string) => post<NotificationView>(`${PATH}/${id}/retry`),
    onSuccess: () => client.invalidateQueries({ queryKey: [PATH] }),
  });

  return (
    <div>
      <PageHeader
        title="Avisos por e-mail"
        description="Falhas de envio não desfazem as operações; aqui é possível reenviar depois de corrigir a causa."
      />
      <div className="toolbar">
        <select
          aria-label="Situação"
          value={list.filters.status}
          onChange={(e) => list.setFilter({ status: e.target.value })}
        >
          <option value="">Todas as situações</option>
          {NOTIFICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS[status].label}
            </option>
          ))}
        </select>
      </div>
      {retry.isError && <QueryError error={retry.error} />}
      <PagedResults
        query={list.query}
        emptyMessage="Nenhum aviso nesta situação."
        onPage={list.setPage}
      >
        {(items) => (
          <table>
            <thead>
              <tr>
                <th>Aviso</th>
                <th>Situação</th>
                <th>Tentativas</th>
                <th>Registrado em</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {items.map((notification) => (
                <tr key={notification.id}>
                  <td>
                    {TEMPLATE_LABELS[notification.template]}
                    <span className="sub">{notification.recipient}</span>
                    {notification.lastError &&
                      notification.status !== 'enviada' && (
                        <span className="sub">
                          Último erro: {notification.lastError}
                        </span>
                      )}
                  </td>
                  <td>
                    <Badge tone={STATUS[notification.status].tone}>
                      {STATUS[notification.status].label}
                    </Badge>
                    {notification.nextAttemptAt && (
                      <span className="sub">
                        Próxima: {formatDateTime(notification.nextAttemptAt)}
                      </span>
                    )}
                  </td>
                  <td>{notification.attempts}</td>
                  <td>
                    {formatDateTime(notification.createdAt)}
                    {notification.sentAt && (
                      <span className="sub">
                        Enviado: {formatDateTime(notification.sentAt)}
                      </span>
                    )}
                  </td>
                  <td>
                    {notification.status === 'falhou' && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(notification.id)}
                      >
                        Reenviar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PagedResults>
    </div>
  );
}
