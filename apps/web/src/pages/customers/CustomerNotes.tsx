import {
  INTERNAL_NOTE_MAX_LENGTH,
  updateCustomerNotesSchema,
  type CustomerNotesView,
} from '@central/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { get, put } from '../../api/client';
import { Alert, FormAlert, QueryError } from '../../components/feedback';
import { SubmitButton, TextAreaField } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { raw, useSchemaForm } from '../../lib/forms';

function NotesForm(props: {
  path: string;
  notes: CustomerNotesView;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const [body, setBody] = useState(props.notes.body);
  const form = useSchemaForm({
    schema: updateCustomerNotesSchema,
    read: (data) => ({ body: raw(data, 'body') }),
    submit: (value) => put<CustomerNotesView>(props.path, value),
    onSuccess: () => void client.invalidateQueries({ queryKey: [props.path] }),
  });
  const { updatedAt, updatedBy } = props.notes;

  if (!props.canEdit) {
    return props.notes.body ? (
      <p className="message-body">{props.notes.body}</p>
    ) : (
      <p className="muted">Nenhuma observação.</p>
    );
  }
  return (
    <form onSubmit={form.onSubmit} noValidate>
      {form.done && <Alert tone="success">Observações salvas.</Alert>}
      <FormAlert message={form.formError} />
      <TextAreaField
        label="Observações"
        name="body"
        value={body}
        onChange={setBody}
        errors={form.fieldErrors}
        maxLength={INTERNAL_NOTE_MAX_LENGTH}
        hint={
          updatedAt
            ? `Atualizadas em ${formatDateTime(updatedAt)}${updatedBy ? ` por ${updatedBy.name}` : ''}. Deixe em branco para apagar.`
            : 'Acordos, preferências e histórico do cliente.'
        }
      />
      <div className="actions">
        <SubmitButton pending={form.pending}>Salvar observações</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Observações internas do cliente, só da equipe: não aparecem no portal.
 * Recebem as notas internas do cadastro no sistema anterior.
 */
export function CustomerNotes(props: { customerId: string; canEdit: boolean }) {
  const path = `/customers/${props.customerId}/notes`;
  const query = useQuery({
    queryKey: [path],
    queryFn: () => get<CustomerNotesView>(path),
  });

  return (
    <section className="card">
      <h2>Observações internas</h2>
      <p className="muted with-icon">
        <Lock size={16} aria-hidden />
        Só a equipe vê.
      </p>
      {query.isError && <QueryError error={query.error} />}
      {query.data && (
        <NotesForm path={path} notes={query.data} canEdit={props.canEdit} />
      )}
    </section>
  );
}
