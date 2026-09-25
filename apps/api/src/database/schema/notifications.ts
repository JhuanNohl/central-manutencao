import {
  NOTIFICATION_STATUSES,
  NOTIFICATION_TEMPLATES,
} from '@central/contracts';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, oneOf } from './columns.js';

/**
 * Intenção durável de notificação (outbox). É gravada na mesma transação da
 * operação que a origina e processada depois; falha de SMTP não desfaz a operação.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    template: text('template', { enum: NOTIFICATION_TEMPLATES }).notNull(),
    recipient: text('recipient').notNull(),
    /** Dados do modelo. Links com token são removidos após o envio. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: NOTIFICATION_STATUSES })
      .notNull()
      .default('pendente'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    nextAttemptAt: instant('next_attempt_at').defaultNow().notNull(),
    lockedUntil: instant('locked_until'),
    lastError: text('last_error'),
    /** Evita agendar duas vezes o mesmo aviso para a mesma origem. */
    dedupeKey: text('dedupe_key'),
    /** Referência da origem, ex.: `invitation:<id>`. */
    origin: text('origin').notNull(),
    createdAt: createdAt(),
    sentAt: instant('sent_at'),
  },
  (t) => [
    uniqueIndex('notifications_dedupe_key').on(t.dedupeKey),
    index('notifications_queue_idx').on(t.status, t.nextAttemptAt),
    check('notifications_status_valid', oneOf(t.status, NOTIFICATION_STATUSES)),
    check(
      'notifications_template_valid',
      oneOf(t.template, NOTIFICATION_TEMPLATES),
    ),
  ],
);
