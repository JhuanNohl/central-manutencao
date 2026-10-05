import {
  createStaffInvitationSchema,
  INVITATION_STATUSES,
  ROLE_LABELS,
  STAFF_ROLES,
  type InvitationStatus,
  type InvitationView,
} from '@central/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleCheck, Clock, Hourglass, Send } from 'lucide-react';
import { post } from '../../api/client';
import { Badge, type StatusStyle } from '../../components/Badge';
import { Alert, FormAlert, QueryError } from '../../components/feedback';
import { FilterTabs } from '../../components/filters';
import { PagedResults } from '../../components/PagedResults';
import {
  Field,
  PageHeader,
  SelectField,
  SubmitButton,
} from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { text, useSchemaForm } from '../../lib/forms';
import { usePagedList } from '../../lib/paged-list';

const PATH = '/invitations';

const STATUS: Record<InvitationStatus, StatusStyle> = {
  pendente: { label: 'Pendente', tone: 'warning', icon: Clock },
  aceito: { label: 'Aceito', tone: 'success', icon: CircleCheck },
  revogado: { label: 'Revogado', tone: 'neutral', icon: Ban },
  expirado: { label: 'Expirado', tone: 'neutral', icon: Hourglass },
};

const STATUS_TABS = [
  { value: '' as const, label: 'Todos' },
  ...INVITATION_STATUSES.map((status) => ({
    value: status,
    label: STATUS[status].label,
  })),
];

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
      <p className="muted">
        A pessoa recebe por e-mail o aviso do acesso criado, com o perfil, e
        define a própria senha pelo link. Ao concluir, recebe a confirmação de
        acesso liberado.
      </p>
      <form onSubmit={form.onSubmit} noValidate>
        <FormAlert message={form.formError} />
        {form.done && (
          <Alert tone="success">
            Convite registrado. O e-mail com o link de acesso será enviado em
            instantes.
          </Alert>
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
          <SubmitButton pending={form.pending}>
            Enviar convite
            <Send size={18} aria-hidden />
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function InvitationsPage() {
  const refresh = useRefreshInvitations();
  const list = usePagedList<InvitationView, { status: InvitationStatus | '' }>(
    PATH,
    { status: '' },
  );
  const revoke = useMutation({
    mutationFn: (id: string) => post<InvitationView>(`${PATH}/${id}/revoke`),
    onSuccess: refresh,
  });

  return (
    <div className="stack">
      <PageHeader title="Convites" />
      <StaffInvitationForm />

      <section className="panel">
        <div className="panel-header">
          <h2>Convites enviados</h2>
          <FilterTabs
            label="Situação do convite"
            value={list.filters.status}
            options={STATUS_TABS}
            onChange={(status) => list.setFilter({ status })}
          />
        </div>
        {revoke.isError && (
          <div className="panel-body">
            <QueryError error={revoke.error} />
          </div>
        )}
        <PagedResults list={list} emptyMessage="Nenhum convite.">
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
                      <Badge status={STATUS[invitation.status]} />
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
