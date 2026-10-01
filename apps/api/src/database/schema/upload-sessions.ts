import { UPLOAD_SESSION_KINDS } from '@central/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, oneOf } from './columns.js';
import { files } from './files.js';
import { accounts } from './identity.js';
import { rmaItems } from './rmas.js';

/**
 * Envio pelo celular aberto por um QR Code. O banco guarda só o SHA-256 do
 * token; os arquivos enviados pertencem à conta que gerou o código, como se
 * ela mesma os tivesse enviado do computador.
 */
export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: UPLOAD_SESSION_KINDS }).notNull(),
    /** Equipamento exibido no celular. */
    label: text('label').notNull(),
    /** Item que recebe o vídeo de validação; só nas sessões de validação. */
    rmaItemId: uuid('rma_item_id').references(() => rmaItems.id, {
      onDelete: 'cascade',
    }),
    photoLimit: integer('photo_limit').notNull(),
    videoLimit: integer('video_limit').notNull(),
    createdAt: createdAt(),
    expiresAt: instant('expires_at').notNull(),
    closedAt: instant('closed_at'),
  },
  (t) => [
    uniqueIndex('upload_sessions_token_hash_key').on(t.tokenHash),
    index('upload_sessions_owner_idx').on(t.ownerAccountId),
    check('upload_sessions_kind_valid', oneOf(t.kind, UPLOAD_SESSION_KINDS)),
    check(
      'upload_sessions_item_for_validacao',
      sql`(${t.kind} = 'validacao') = (${t.rmaItemId} is not null)`,
    ),
    check(
      'upload_sessions_limits_valid',
      sql`${t.photoLimit} >= 0 and ${t.videoLimit} >= 0`,
    ),
  ],
);

/** Arquivos recebidos em cada sessão, para o limite e o acompanhamento. */
export const uploadSessionFiles = pgTable(
  'upload_session_files',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => uploadSessions.id, { onDelete: 'cascade' }),
    // Temporário removido pela limpeza leva junto o registro do envio.
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('upload_session_files_file_key').on(t.fileId),
    index('upload_session_files_session_idx').on(t.sessionId, t.createdAt),
  ],
);
