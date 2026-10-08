import {
  RMA_MESSAGE_MAX_LENGTH,
  type RmaMessageSide,
} from '@central/contracts';
import type { ImportedUser, ImportedUsers } from './customer-import.js';
import type { ImportReport } from './import-report.js';
import { openingMessageOf } from './legacy-mapping.js';
import type { LegacyThreadEntry, LegacyTicket } from './legacy-source.js';
import { plainTextOf, splitText } from './legacy-text.js';
import type { StaffAccounts } from './staff-import.js';

/** Mensagem da conversa com o cliente; `legacyId` nulo na abertura montada. */
export interface MessagePlan {
  legacyId: number | null;
  side: RmaMessageSide;
  authorAccountId: string;
  body: string;
  createdAt: Date;
}

export interface NotePlan {
  legacyId: number;
  authorAccountId: string | null;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface ConversationPlan {
  messages: MessagePlan[];
  notes: NotePlan[];
}

/** Tipos de entrada da conversa do osTicket. */
const ENTRY_TYPES = { message: 'M', response: 'R', note: 'N' } as const;
const STAFF_FALLBACK_NAME = 'Equipe (sistema anterior)';

export interface ConversationSources {
  ticket: LegacyTicket;
  requester: ImportedUser;
  users: ImportedUsers;
  staff: StaffAccounts;
  report: ImportReport;
}

/** Mensagem longa vira várias, para nada passar do limite da conversa. */
function messagesOf(
  legacyId: number | null,
  side: RmaMessageSide,
  authorAccountId: string,
  text: string,
  createdAt: Date,
): MessagePlan[] {
  return splitText(text, RMA_MESSAGE_MAX_LENGTH).map((body, index) => ({
    legacyId: index === 0 ? legacyId : null,
    side,
    authorAccountId,
    body,
    createdAt,
  }));
}

/** Autor da mensagem do cliente: quem escreveu, se foi importado; senão, o solicitante. */
function customerAuthorOf(
  sources: ConversationSources,
  entry: LegacyThreadEntry,
): string {
  const user = sources.users.get(entry.userId);
  return user?.customerId === sources.requester.customerId
    ? user.accountId
    : sources.requester.accountId;
}

function planEntry(
  sources: ConversationSources,
  entry: LegacyThreadEntry,
  plan: ConversationPlan,
): void {
  const text = plainTextOf(entry.body, entry.format);
  if (!text) return;
  const staffAccount = sources.staff.get(entry.staffId) ?? null;
  const authorName = entry.poster.trim() || STAFF_FALLBACK_NAME;
  switch (entry.type) {
    case ENTRY_TYPES.message:
      plan.messages.push(
        ...messagesOf(
          entry.id,
          'cliente',
          customerAuthorOf(sources, entry),
          text,
          entry.createdAt,
        ),
      );
      return;
    case ENTRY_TYPES.response:
      if (staffAccount) {
        plan.messages.push(
          ...messagesOf(
            entry.id,
            'equipe',
            staffAccount,
            text,
            entry.createdAt,
          ),
        );
        return;
      }
      // Sem conta do agente, a resposta não pode ter autor na conversa: fica
      // registrada como nota interna, com o nome de quem respondeu.
      sources.report.warn(
        `ticket ${sources.ticket.number}`,
        `resposta ${entry.id} de agente sem conta virou nota interna`,
      );
      plan.notes.push({
        legacyId: entry.id,
        authorAccountId: null,
        authorName,
        body: `Resposta enviada ao cliente no sistema anterior:\n\n${text}`,
        createdAt: entry.createdAt,
      });
      return;
    case ENTRY_TYPES.note:
      plan.notes.push({
        legacyId: entry.id,
        authorAccountId: staffAccount,
        authorName,
        body: text,
        createdAt: entry.createdAt,
      });
      return;
    default:
      sources.report.warn(
        `ticket ${sources.ticket.number}`,
        `entrada ${entry.id} de tipo "${entry.type}" ignorada`,
      );
  }
}

/**
 * Conversa do ticket: o assunto e as observações abrem a conversa como
 * mensagem do cliente; `M` e `R` viram mensagens e `N`, notas internas.
 */
export function planConversation(
  sources: ConversationSources,
  entries: LegacyThreadEntry[],
): ConversationPlan {
  const plan: ConversationPlan = { messages: [], notes: [] };
  const opening = openingMessageOf(
    sources.ticket.subject,
    sources.ticket.observations,
  );
  if (opening) {
    plan.messages.push(
      ...messagesOf(
        null,
        'cliente',
        sources.requester.accountId,
        opening,
        sources.ticket.createdAt,
      ),
    );
  }
  const ordered = [...entries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  for (const entry of ordered) planEntry(sources, entry, plan);
  return plan;
}
