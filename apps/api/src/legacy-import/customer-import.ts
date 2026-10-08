import type { CustomerKind } from '@central/contracts';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../database/database.types.js';
import { readSafeXml } from '../files/file-content.js';
import { termsAcceptedOnCreation } from '../legal/terms-acceptance.js';
import { readIssuerDocument } from '../rmas/invoice-xml.js';
import {
  accounts,
  customerContacts,
  customerNotes,
  customers,
} from '../database/schema/index.js';
import {
  accountByEmail,
  importedPasswordHash,
  normalizedEmail,
  type ImportContext,
} from './import-context.js';
import {
  contactPhoneOf,
  customerDocumentOf,
  customerNotesOf,
} from './legacy-mapping.js';
import {
  importedEntityOf,
  LEGACY_SOURCES,
  recordLegacy,
} from './legacy-records.js';
import type { LegacyUser } from './legacy-source.js';

const emailSchema = z.email();

/** Cliente, contato e conta de um usuário do legado. */
export interface ImportedUser {
  customerId: string;
  contactId: string;
  accountId: string;
  document: string;
}

export type ImportedUsers = ReadonlyMap<number, ImportedUser>;

const sourceOf = (user: LegacyUser) => `ost_user ${user.id}`;

async function importedUserOf(
  db: Executor,
  contactId: string,
): Promise<ImportedUser | null> {
  const [row] = await db
    .select({
      customerId: customerContacts.customerId,
      accountId: customerContacts.accountId,
      document: customers.document,
    })
    .from(customerContacts)
    .innerJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(eq(customerContacts.id, contactId));
  if (!row?.accountId) return null;
  return { ...row, contactId, accountId: row.accountId };
}

/**
 * Cliente do documento: o já importado (vários usuários com o mesmo CPF/CNPJ
 * viram contatos de um cliente só), o já cadastrado aqui ou um novo.
 */
async function customerFor(
  ctx: ImportContext,
  db: Executor,
  user: LegacyUser,
  identity: { document: string; kind: CustomerKind },
): Promise<string> {
  const imported = await importedEntityOf(
    db,
    LEGACY_SOURCES.customer,
    identity.document,
  );
  if (imported) return imported;
  const [registered] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.document, identity.document));
  if (registered) {
    ctx.report.warn(
      sourceOf(user),
      'o CPF/CNPJ já estava cadastrado aqui; o usuário entrou como contato desse cliente',
    );
    return registered.id;
  }
  // Gravação direta, e não por customer-records.ts: o cadastro importado
  // mantém a data do legado e não tem quem o tenha criado aqui.
  const [customer] = await db
    .insert(customers)
    .values({
      kind: identity.kind,
      name: user.name,
      document: identity.document,
      createdAt: user.createdAt,
    })
    .returning({ id: customers.id });
  await recordLegacy(db, [
    {
      sourceTable: LEGACY_SOURCES.customer,
      sourceId: identity.document,
      entityType: 'customer',
      entityId: customer.id,
    },
  ]);
  ctx.report.count('clientes');
  return customer.id;
}

/**
 * Cadastro sem CPF/CNPJ: vale o do emitente da NF dos tickets do usuário, já
 * que a nota de remessa é emitida pelo próprio cliente (decisão de 08/10/2026).
 */
async function identityFromInvoices(
  ctx: ImportContext,
  user: LegacyUser,
): Promise<{ document: string; kind: CustomerKind } | null> {
  for (const fileId of await ctx.source.invoiceFileIds(user.id)) {
    const file = await ctx.source.fileContent(fileId);
    const xml = file && readSafeXml(file.content);
    const identity = xml ? customerDocumentOf(readIssuerDocument(xml)) : null;
    if (identity) {
      ctx.report.warn(
        sourceOf(user),
        `sem CPF/CNPJ no cadastro; usado o do emitente da NF (arquivo ${fileId})`,
      );
      return identity;
    }
  }
  return null;
}

/** Observações internas: o segundo usuário do mesmo cliente acrescenta as suas. */
async function appendCustomerNotes(
  db: Executor,
  customerId: string,
  body: string,
): Promise<void> {
  await db
    .insert(customerNotes)
    .values({ customerId, body })
    .onConflictDoUpdate({
      target: customerNotes.customerId,
      set: { body: sql`${customerNotes.body} || E'\n\n' || ${body}` },
    });
}

async function importUser(
  ctx: ImportContext,
  user: LegacyUser,
  identity: { document: string; kind: CustomerKind },
  email: string,
): Promise<ImportedUser> {
  const passwordHash = await importedPasswordHash(user.passwordHash);
  return ctx.db.transaction(async (tx) => {
    const customerId = await customerFor(ctx, tx, user, identity);
    const [account] = await tx
      .insert(accounts)
      .values({
        email,
        name: user.name,
        passwordHash,
        role: 'cliente',
        emailVerifiedAt: user.createdAt,
        ...termsAcceptedOnCreation(ctx.options.termsVersion, new Date()),
        createdAt: user.createdAt,
      })
      .returning({ id: accounts.id });
    const [contact] = await tx
      .insert(customerContacts)
      .values({
        customerId,
        name: user.name,
        email,
        phone: contactPhoneOf(user.phone),
        accountId: account.id,
        createdAt: user.createdAt,
      })
      .returning({ id: customerContacts.id });
    const notes = customerNotesOf(user.notes, user.organization);
    if (notes) await appendCustomerNotes(tx, customerId, notes);
    await recordLegacy(tx, [
      {
        sourceTable: LEGACY_SOURCES.contact,
        sourceId: user.id,
        entityType: 'customer_contact',
        entityId: contact.id,
      },
      {
        sourceTable: LEGACY_SOURCES.account,
        sourceId: user.id,
        entityType: 'account',
        entityId: account.id,
      },
    ]);
    return {
      customerId,
      contactId: contact.id,
      accountId: account.id,
      document: identity.document,
    };
  });
}

/**
 * Usuários (`ost_user` e formulário) → clientes, contatos e contas do portal.
 * Só entram os cadastros válidos (decisão de 06/10/2026): sem CPF/CNPJ (nem
 * no cadastro, nem na NF) ou sem e-mail válido, o usuário e os tickets dele
 * ficam de fora.
 */
export async function importUsers(ctx: ImportContext): Promise<ImportedUsers> {
  // O mais antigo primeiro: ele dá o nome ao cliente de um CPF/CNPJ repetido.
  const users = (await ctx.source.users()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  );
  const imported = new Map<number, ImportedUser>();
  for (const user of users) {
    const previous = await importedEntityOf(
      ctx.db,
      LEGACY_SOURCES.contact,
      user.id,
    );
    const previousUser = previous && (await importedUserOf(ctx.db, previous));
    if (previousUser) {
      imported.set(user.id, previousUser);
      ctx.report.countExisting('contatos');
      continue;
    }
    const identity =
      customerDocumentOf(user.document) ??
      (await identityFromInvoices(ctx, user));
    if (!identity) {
      ctx.report.skip(sourceOf(user), 'sem CPF/CNPJ válido');
      continue;
    }
    const email = normalizedEmail(user.email);
    if (!email || !emailSchema.safeParse(email).success) {
      ctx.report.skip(sourceOf(user), 'sem e-mail válido');
      continue;
    }
    if (await accountByEmail(ctx.db, email)) {
      ctx.report.skip(sourceOf(user), 'o e-mail já é de outra conta');
      continue;
    }
    imported.set(user.id, await importUser(ctx, user, identity, email));
    ctx.report.count('contatos');
  }
  return imported;
}
