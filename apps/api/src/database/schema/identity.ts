import { ACCOUNT_STATUSES, CUSTOMER_KINDS, ROLES } from '@central/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, instant, oneOf, updatedAt } from './columns.js';

export const ACCOUNT_TOKEN_PURPOSES = [
  'redefinicao_senha',
  'confirmacao_email',
] as const;
export type AccountTokenPurpose = (typeof ACCOUNT_TOKEN_PURPOSES)[number];

/** Identidade de acesso. Cadastro de cliente fica em `customers`. */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    status: text('status', { enum: ACCOUNT_STATUSES })
      .notNull()
      .default('ativa'),
    emailVerifiedAt: instant('email_verified_at'),
    lastLoginAt: instant('last_login_at'),
    disabledAt: instant('disabled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('accounts_email_key').on(t.email),
    check('accounts_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('accounts_role_valid', oneOf(t.role, ROLES)),
    check('accounts_status_valid', oneOf(t.status, ACCOUNT_STATUSES)),
    check(
      'accounts_disabled_consistent',
      sql`(${t.status} = 'desativada') = (${t.disabledAt} is not null)`,
    ),
  ],
);

/** Cliente atendido (pessoa física ou jurídica). */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: CUSTOMER_KINDS }).notNull(),
    name: text('name').notNull(),
    tradeName: text('trade_name'),
    /** CPF ou CNPJ normalizado (sem pontuação, maiúsculas). */
    document: text('document').notNull(),
    createdByAccountId: uuid('created_by_account_id').references(
      () => accounts.id,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('customers_document_key').on(t.document),
    check('customers_kind_valid', oneOf(t.kind, CUSTOMER_KINDS)),
    check(
      'customers_document_format',
      sql`(${t.kind} = 'pessoa_fisica' and ${t.document} ~ '^[0-9]{11}$')
        or (${t.kind} = 'pessoa_juridica' and ${t.document} ~ '^[0-9A-Z]{12}[0-9]{2}$')`,
    ),
    index('customers_name_idx').on(t.name),
  ],
);

/** Pessoa de contato de um cliente; pode ter (no máximo) uma conta no portal. */
export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    accountId: uuid('account_id').references(() => accounts.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('customer_contacts_account_key').on(t.accountId),
    uniqueIndex('customer_contacts_customer_email_key').on(
      t.customerId,
      t.email,
    ),
    check(
      'customer_contacts_email_lowercase',
      sql`${t.email} = lower(${t.email})`,
    ),
  ],
);

/**
 * Sessão autenticada. O cookie guarda o token; o banco guarda apenas o
 * SHA-256 (`id`), de modo que um vazamento da tabela não permite sequestro.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: instant('last_seen_at').defaultNow().notNull(),
    idleExpiresAt: instant('idle_expires_at').notNull(),
    absoluteExpiresAt: instant('absolute_expires_at').notNull(),
    revokedAt: instant('revoked_at'),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_account_idx').on(t.accountId)],
);

/** Tokens de uso único enviados por e-mail (armazenados como hash). */
export const accountTokens = pgTable(
  'account_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: ACCOUNT_TOKEN_PURPOSES }).notNull(),
    createdAt: createdAt(),
    expiresAt: instant('expires_at').notNull(),
    usedAt: instant('used_at'),
  },
  (t) => [
    uniqueIndex('account_tokens_hash_key').on(t.tokenHash),
    index('account_tokens_account_idx').on(t.accountId, t.purpose),
    check(
      'account_tokens_purpose_valid',
      oneOf(t.purpose, ACCOUNT_TOKEN_PURPOSES),
    ),
  ],
);

/**
 * Convite individual, com validade e uso único. Convite de cliente aponta
 * para um contato já cadastrado; convite da equipe traz o papel concedido.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    email: text('email').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    customerContactId: uuid('customer_contact_id').references(
      () => customerContacts.id,
    ),
    invitedByAccountId: uuid('invited_by_account_id').references(
      () => accounts.id,
    ),
    createdAt: createdAt(),
    expiresAt: instant('expires_at').notNull(),
    acceptedAt: instant('accepted_at'),
    acceptedAccountId: uuid('accepted_account_id').references(
      () => accounts.id,
    ),
    revokedAt: instant('revoked_at'),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    // No máximo um convite em aberto por e-mail.
    uniqueIndex('invitations_open_email_key')
      .on(t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    check('invitations_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('invitations_role_valid', oneOf(t.role, ROLES)),
    check(
      'invitations_customer_contact_for_cliente',
      sql`(${t.role} = 'cliente') = (${t.customerContactId} is not null)`,
    ),
    check(
      'invitations_single_outcome',
      sql`not (${t.acceptedAt} is not null and ${t.revokedAt} is not null)`,
    ),
  ],
);
