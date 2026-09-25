import {
  createStaffInvitationSchema,
  INVITATION_STATUSES,
  ROLE_LABELS,
  STAFF_ROLES,
  type InvitationStatus,
  type InvitationView,
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
import {
  Badge,
  Field,
  FormAlert,
  PageHeader,
  Pagination,
  QueryError,
  SelectField,
  SubmitButton,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';

const STATUS: Record<
  InvitationStatus,
  { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' }
> = {
  pendente: { label: 'Pendente', tone: 'info' },
  aceito: { label: 'Aceito', tone: 'success' },
  revogado: { label: 'Revogado', tone: 'neutral' },
  expirado: { label: 'Expirado', tone: 'warning' },
};

export function InvitationsPage() {
  const client = useQueryClient();
  const [filters, setFilters] = useState({ status: '', page: 1 });

  const query = useQuery({
    queryKey: ['invitations', filters],
    queryFn: () =>
      get<Page<InvitationView>>(
        `/invitations${toQuery({ ...filters, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const form = useSchemaForm({
    schema: createStaffInvitationSchema,
    read: (data) => ({ email: text(data, 'email'), role: text(data, 'role') }),
    submit: (body) => post<InvitationView>('/invitations/staff', body),
    onSuccess: (_, element) => {
      element.reset();
      void client.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      post<InvitationView>(`/invitations/${id}/revoke`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['invitations'] }),
  });

  return (
    <div className="stack">
      <PageHeader
        title="Convites"
        description="Convites são pessoais, valem por 7 dias e podem ser usados uma única vez."
      />

      <section className="card">
        <h2>Convidar integrante da equipe</h2>
        <form onSubmit={form.onSubmit} noValidate>
          <FormAlert message={form.formError} />
          {form.done && (
            <div className="alert alert-success" role="status">
              Convite registrado. O e-mail será enviado em instantes.
            </div>
          )}
          <div className="field-row">
            <Field
              label="E-mail"
              name="email"
              type="email"
              inputMode="email"
              errors={form.fieldErrors}
            />
            <SelectField
              label="Papel"
              name="role"
              defaultValue="agente"
              errors={form.fieldErrors}
              options={STAFF_ROLES.map((role) => ({
                value: role,
                label: ROLE_LABELS[role],
              }))}
            />
          </div>
          <div className="actions">
            <SubmitButton pending={form.pending}>Enviar convite</SubmitButton>
          </div>
        </form>
      </section>

      <section>
        <div className="toolbar">
          <select
            aria-label="Situação"
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value, page: 1 })}
          >
            <option value="">Todas as situações</option>
            {INVITATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS[status].label}
              </option>
            ))}
          </select>
        </div>
        {query.isError && <QueryError error={query.error} />}
        {revoke.isError && <QueryError error={revoke.error} />}
        {query.data && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Convidado</th>
                    <th>Papel</th>
                    <th>Situação</th>
                    <th>Validade</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>
                        {invitation.email}
                        {invitation.customer && (
                          <span className="sub">
                            {invitation.customer.name}
                          </span>
                        )}
                        {invitation.invitedBy && (
                          <span className="sub">
                            por {invitation.invitedBy.name}
                          </span>
                        )}
                      </td>
                      <td>{ROLE_LABELS[invitation.role]}</td>
                      <td>
                        <Badge tone={STATUS[invitation.status].tone}>
                          {STATUS[invitation.status].label}
                        </Badge>
                      </td>
                      <td>
                        {formatDateTime(
                          invitation.acceptedAt ?? invitation.expiresAt,
                        )}
                      </td>
                      <td>
                        {invitation.status === 'pendente' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={revoke.isPending}
                            onClick={() => revoke.mutate(invitation.id)}
                          >
                            Revogar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {query.data.items.length === 0 && (
                <div className="empty">Nenhum convite.</div>
              )}
            </div>
            <Pagination
              {...query.data}
              onPage={(page) => setFilters((f) => ({ ...f, page }))}
            />
          </>
        )}
      </section>
    </div>
  );
}
