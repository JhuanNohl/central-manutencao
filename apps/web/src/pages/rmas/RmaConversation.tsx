import {
  RMA_MESSAGE_MAX_LENGTH,
  RMA_MESSAGE_SIDE_LABELS,
  sendRmaMessageSchema,
  type RmaMessageView,
} from '@central/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { get, post } from '../../api/client';
import { FormAlert, QueryError } from '../../components/feedback';
import { SubmitButton, TextAreaField } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { raw, useSchemaForm } from '../../lib/forms';

/** Âncora da conversa, para os avisos da tela apontarem para ela. */
export const CONVERSATION_ANCHOR = 'conversa';

/** A conversa é consultada de novo enquanto a tela está aberta. */
const MESSAGES_REFRESH_MS = 20_000;

/** "Você", o nome de quem escreveu e o lado, quando o nome não o revela. */
function authorLine(message: RmaMessageView): string {
  if (message.mine) return 'Você';
  const side = RMA_MESSAGE_SIDE_LABELS[message.side];
  return message.authorName ? `${message.authorName} · ${side}` : side;
}

function MessageList({ messages }: { messages: RmaMessageView[] }) {
  const ref = useRef<HTMLOListElement>(null);
  // A mensagem mais recente fica visível, como numa conversa.
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages.length]);

  return (
    <ol className="message-list" ref={ref} aria-label="Mensagens">
      {messages.map((message) => (
        <li
          key={message.id}
          className={`message${message.mine ? ' message-mine' : ''}`}
        >
          <span className="message-meta">
            <strong>{authorLine(message)}</strong>
            {' · '}
            <time dateTime={message.sentAt}>
              {formatDateTime(message.sentAt)}
            </time>
          </span>
          <p className="message-body">{message.body}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Conversa do chamado entre o cliente e a equipe, para combinar detalhes do
 * atendimento. Cada lado recebe um aviso por e-mail e lê a mensagem aqui.
 * Fica em destaque no chamado cancelado, onde se combina a devolução.
 */
export function RmaConversation(props: {
  /** Rota da API da conversa (equipe ou portal). */
  path: string;
  title: string;
  canSend: boolean;
  hint: string;
  emptyMessage: string;
  highlighted?: boolean;
}) {
  const client = useQueryClient();
  const [body, setBody] = useState('');
  const query = useQuery({
    queryKey: [props.path],
    queryFn: () => get<RmaMessageView[]>(props.path),
    refetchInterval: MESSAGES_REFRESH_MS,
  });
  const form = useSchemaForm({
    schema: sendRmaMessageSchema,
    read: (data) => ({ body: raw(data, 'body') }),
    submit: (value) => post<RmaMessageView>(props.path, value),
    onSuccess: () => {
      setBody('');
      void client.invalidateQueries({ queryKey: [props.path] });
    },
  });

  return (
    <section
      id={CONVERSATION_ANCHOR}
      className={`card conversation${props.highlighted ? ' conversation-highlighted' : ''}`}
    >
      <h2>
        <MessagesSquare size={20} aria-hidden className="inline-icon" />
        {props.title}
      </h2>
      {query.isError && <QueryError error={query.error} />}
      {query.data &&
        (query.data.length === 0 ? (
          <p className="muted">{props.emptyMessage}</p>
        ) : (
          <MessageList messages={query.data} />
        ))}
      {props.canSend && (
        <form onSubmit={form.onSubmit} noValidate className="message-form">
          <TextAreaField
            label="Mensagem"
            name="body"
            value={body}
            onChange={setBody}
            errors={form.fieldErrors}
            hint={props.hint}
            maxLength={RMA_MESSAGE_MAX_LENGTH}
          />
          <FormAlert message={form.formError} />
          <div className="actions">
            <SubmitButton pending={form.pending}>
              <Send size={18} aria-hidden />
              Enviar
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
