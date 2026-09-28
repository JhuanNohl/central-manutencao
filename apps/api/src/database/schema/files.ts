import { FILE_CONTENT_TYPES, FILE_PURPOSES } from '@central/contracts';
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
import { accounts } from './identity.js';

/**
 * Arquivo privado enviado por uma conta. Nasce temporário (`linked_at` nulo)
 * e só pode ser vinculado pelo próprio autor, uma vez, na finalidade
 * declarada. Temporários abandonados são removidos após o prazo configurado.
 * O conteúdo fica no armazenamento de arquivos, identificado por `storage_key`.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id),
    purpose: text('purpose', { enum: FILE_PURPOSES }).notNull(),
    originalName: text('original_name').notNull(),
    /** Tipo reconhecido pelo conteúdo, não o informado pelo navegador. */
    contentType: text('content_type', { enum: FILE_CONTENT_TYPES }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: createdAt(),
    linkedAt: instant('linked_at'),
  },
  (t) => [
    uniqueIndex('files_storage_key').on(t.storageKey),
    index('files_owner_idx').on(t.ownerAccountId),
    index('files_temporary_idx')
      .on(t.createdAt)
      .where(sql`${t.linkedAt} is null`),
    check('files_purpose_valid', oneOf(t.purpose, FILE_PURPOSES)),
    check('files_content_type_valid', oneOf(t.contentType, FILE_CONTENT_TYPES)),
    check('files_size_positive', sql`${t.sizeBytes} > 0`),
  ],
);
