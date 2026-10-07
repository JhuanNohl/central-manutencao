import {
  addRmaInternalNoteSchema,
  INTERNAL_NOTE_MAX_LENGTH,
  type RmaInternalNoteView,
} from '@central/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { get, post } from '../../api/client';
import { FormAlert, QueryError } from '../../components/feedback';
import { SubmitButton, TextAreaField } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { raw, useSchemaForm } from '../../lib/forms';

/**
 * Anotações internas do chamado, só da equipe (RN11): ficam fora da conversa
 * com o cliente. Recebem também as notas internas do sistema anterior.
 */
export const internalNotesPath = (number: number) =>
  `/rmas/${number}/internal-notes`;

export function RmaInternalNotes(props: { number: number; canAdd: boolean }) {
  const path = internalNotesPath(props.number);
  const client = useQueryClient();
  const [body, setBody] = useState('');
  const query = useQuery({
    queryKey: [path],
    queryFn: () => get<RmaInternalNoteView[]>(path),
  });
  const form = useSchemaForm({
    schema: addRmaInternalNoteSchema,
    read: (data) => ({ body: raw(data, 'body') }),
    submit: (value) => post<RmaInternalNoteView>(path, value),
    onSuccess: () => {
      setBody('');
      void client.invalidateQueries({ queryKey: [path] });
    },
  });

  return (
    <section className="card conversation">
      <h2>
        <NotebookPen size={20} aria-hidden className="inline-icon" />
        Notas internas
      </h2>
      <p className="muted with-icon">
        <Lock size={16} aria-hidden />
        Só a equipe vê. O cliente não recebe aviso.
      </p>
      {query.isError && <QueryError error={query.error} />}
      {query.data &&
        (query.data.length === 0 ? (
          <p className="muted">Nenhuma nota interna.</p>
        ) : (
          <ol className="message-list" aria-label="Notas internas">
            {query.data.map((note) => (
              <li key={note.id} className="message">
                <span className="message-meta">
                  <strong>{note.authorName}</strong>
                  {' · '}
                  <time dateTime={note.createdAt}>
                    {formatDateTime(note.createdAt)}
                  </time>
                </span>
                <p className="message-body">{note.body}</p>
              </li>
            ))}
          </ol>
        ))}
      {props.canAdd && (
        <form onSubmit={form.onSubmit} noValidate className="message-form">
          <TextAreaField
            label="Nova nota interna"
            name="body"
            value={body}
            onChange={setBody}
            errors={form.fieldErrors}
            maxLength={INTERNAL_NOTE_MAX_LENGTH}
          />
          <FormAlert message={form.formError} />
          <div className="actions">
            <SubmitButton pending={form.pending}>Registrar nota</SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
