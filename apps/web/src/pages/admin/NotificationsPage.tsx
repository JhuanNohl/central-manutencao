import {
  NOTIFICATION_STATUSES,
  type NotificationStatus,
  type NotificationTemplate,
  type NotificationView,
  type Page,
} from '@central/contracts';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState } from 'react';
import { get, post, toQuery } from '../../api/client';
import { Badge, PageHeader, Pagination, QueryError } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

const TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  convite: 'Convite',
  redefinicao_senha: 'Redefinição de senha',
  confirmacao_email: 'Confirmação de e-mail',
};

const STATUS: Record<
  NotificationStatus,
  { label: string; tone: 'info' | 'success' | 'danger' | 'warning' }
> = {
  pendente: { label: 'Pendente', tone: 'info' },
  enviando: { label: 'Enviando', tone: 'warning' },
  enviada: { label: 'Enviada', tone: 'success' },
  falhou: { label: 'Falhou', tone: 'danger' },
};

export function NotificationsPage() {
  const client = useQueryClient();
  const [filters, setFilters] = useState({ status: 'falhou', page: 1 });

  const query = useQuery({
    queryKey: ['notifications', filters],
    queryFn: () =>
      get<Page<NotificationView>>(
        `/admin/notifications${toQuery({ ...filters, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) =>
      post<NotificationView>(`/admin/notifications/${id}/retry`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
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
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value, page: 1 })}
        >
          <option value="">Todas as situações</option>
          {NOTIFICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS[status].label}
            </option>
          ))}
        </select>
      </div>
      {query.isError && <QueryError error={query.error} />}
      {retry.isError && <QueryError error={retry.error} />}
      {query.data && (
        <>
          <div className="table-wrap">
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
                {query.data.items.map((notification) => (
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
            {query.data.items.length === 0 && (
              <div className="empty">Nenhum aviso nesta situação.</div>
            )}
          </div>
          <Pagination
            {...query.data}
            onPage={(page) => setFilters((f) => ({ ...f, page }))}
          />
        </>
      )}
    </div>
  );
}
