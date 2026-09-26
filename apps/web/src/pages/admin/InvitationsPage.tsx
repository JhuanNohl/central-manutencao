import {
  createStaffInvitationSchema,
  INVITATION_STATUSES,
  ROLE_LABELS,
  STAFF_ROLES,
  type InvitationStatus,
  type InvitationView,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '../../api/client';
import { PagedResults } from '../../components/PagedResults';
import {
  Badge,
  Field,
  FormAlert,
  PageHeader,
  QueryError,
  SelectField,
  SubmitButton,
  type BadgeTone,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/invitations';

const STATUS: Record<InvitationStatus, { label: string; tone: BadgeTone }> = {
  pendente: { label: 'Pendente', tone: 'info' },
  aceito: { label: 'Aceito', tone: 'success' },
  revogado: { label: 'Revogado', tone: 'neutral' },
  expirado: { label: 'Expirado', tone: 'warning' },
};

function useRefreshInvitations() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: [PATH] });
}

function StaffInvitationForm() {
  const refresh = useRefreshInvitations();
  const form = useSchemaForm({
    schema: createStaffInvitationSchema,
    read: (data) => ({ email: text(data, 'email'), role: text(data, 'role') }),
    submit: (body) => post<InvitationView>(`${PATH}/staff`, body),
    onSuccess: (_, element) => {
      element.reset();
      void refresh();
    },
  });

  return (
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
  );
}

export function InvitationsPage() {
  const refresh = useRefreshInvitations();
  const list = usePagedList<InvitationView, { status: string }>(PATH, {
    status: '',
  });
  const revoke = useMutation({
    mutationFn: (id: string) => post<InvitationView>(`${PATH}/${id}/revoke`),
    onSuccess: refresh,
  });

  return (
    <div className="stack">
      <PageHeader
        title="Convites"
        description="Convites são pessoais, valem por 7 dias e podem ser usados uma única vez."
      />
      <StaffInvitationForm />

      <section>
        <div className="toolbar">
          <select
            aria-label="Situação"
            value={list.filters.status}
            onChange={(e) => list.setFilter({ status: e.target.value })}
          >
            <option value="">Todas as situações</option>
            {INVITATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS[status].label}
              </option>
            ))}
          </select>
        </div>
        {revoke.isError && <QueryError error={revoke.error} />}
        <PagedResults
          query={list.query}
          emptyMessage="Nenhum convite."
          onPage={list.setPage}
        >
          {(invitations) => (
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
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>
                      {invitation.email}
                      {invitation.customer && (
                        <span className="sub">{invitation.customer.name}</span>
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
          )}
        </PagedResults>
      </section>
    </div>
  );
}
