import {
  NOTIFICATION_STATUSES,
  type NotificationStatus,
  type NotificationTemplate,
  type NotificationView,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Clock, Send } from 'lucide-react';
import { post } from '../../api/client';
import { Badge, type StatusStyle } from '../../components/Badge';
import { QueryError } from '../../components/feedback';
import { FilterTabs } from '../../components/filters';
import { PagedResults } from '../../components/PagedResults';
import { PageHeader } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/admin/notifications';
const REFRESH_MS = 15_000;

const TEMPLATE_LABELS: Record<NotificationTemplate, string> = {
  convite: 'Convite',
  acesso_liberado: 'Acesso liberado',
  boas_vindas: 'Boas-vindas',
  acesso_portal: 'Acesso ao portal',
  redefinicao_senha: 'Redefinição de senha',
  confirmacao_email: 'Confirmação de e-mail',
  rma_aberto: 'Atendimento aberto',
  rma_aberto_na_fabrica: 'Atendimento aberto na fábrica',
  rma_itens_recebidos: 'Equipamentos recebidos',
  rma_etapa_alterada: 'Etapa alterada',
  rma_cancelado: 'Atendimento cancelado',
  rma_responsavel: 'Responsável definido',
  rma_mensagem_equipe: 'Mensagem da equipe',
  rma_mensagem_cliente: 'Mensagem do cliente',
  equipe_rma: 'Aviso ao setor',
};

const STATUS: Record<NotificationStatus, StatusStyle> = {
  pendente: { label: 'Pendente', tone: 'neutral', icon: Clock },
  enviando: { label: 'Enviando', tone: 'warning', icon: Send },
  enviada: { label: 'Enviada', tone: 'success', icon: CircleCheck },
  falhou: { label: 'Falhou', tone: 'danger', icon: CircleX },
};

const STATUS_TABS = [
  { value: '' as const, label: 'Todos' },
  ...NOTIFICATION_STATUSES.map((status) => ({
    value: status,
    label: STATUS[status].label,
  })),
];

export function NotificationsPage() {
  const client = useQueryClient();
  const list = usePagedList<
    NotificationView,
    { status: NotificationStatus | '' }
  >(PATH, { status: 'falhou' }, { refetchInterval: REFRESH_MS });
  const retry = useMutation({
    mutationFn: (id: string) => post<NotificationView>(`${PATH}/${id}/retry`),
    onSuccess: () => client.invalidateQueries({ queryKey: [PATH] }),
  });

  return (
    <div>
      <PageHeader title="Avisos por e-mail" />
      <section className="panel">
        <div className="panel-header">
          <FilterTabs
            label="Situação do aviso"
            value={list.filters.status}
            options={STATUS_TABS}
            onChange={(status) => list.setFilter({ status })}
          />
        </div>
        {retry.isError && (
          <div className="panel-body">
            <QueryError error={retry.error} />
          </div>
        )}
        <PagedResults list={list} emptyMessage="Nenhum aviso nesta situação.">
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
                      <Badge status={STATUS[notification.status]} />
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
      </section>
    </div>
  );
}
