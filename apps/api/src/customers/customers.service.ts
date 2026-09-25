import { Inject, Injectable } from '@nestjs/common';
import type {
  ContactInput,
  ContactView,
  CustomerInput,
  CustomerSummary,
  CustomerView,
  ListCustomersQuery,
  Page,
} from '@central/contracts';
import { and, asc, count, eq, ilike, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import { customerContacts, customers } from '../database/schema/index.js';
import { type AuthContext, can } from '../identity/auth-context.js';

type CustomerRow = typeof customers.$inferSelect;

function toSummary(row: CustomerRow): CustomerSummary {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    tradeName: row.tradeName,
    document: row.document,
    createdAt: row.createdAt.toISOString(),
  };
}

function toContact(row: typeof customerContacts.$inferSelect): ContactView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    hasPortalAccess: row.accountId !== null,
  };
}

/**
 * Regra de escopo do cliente: a equipe com `customers.read` alcança qualquer
 * cadastro; a conta de cliente só o próprio. Fora disso responde "não
 * encontrado", sem confirmar a existência do registro.
 */
export function assertCustomerAccess(
  auth: AuthContext,
  customerId: string,
): void {
  if (can(auth, 'customers.read')) return;
  if (auth.account.customer?.id === customerId) return;
  throw ApiException.notFound('Cliente não encontrado.');
}

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCustomersQuery): Promise<Page<CustomerSummary>> {
    const term = query.search
      ? `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      : undefined;
    const where = term
      ? or(
          ilike(customers.name, term),
          ilike(customers.tradeName, term),
          ilike(customers.document, term),
        )
      : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(customers)
        .where(where)
        .orderBy(asc(customers.name))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(customers).where(where),
    ]);
    return {
      items: rows.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(auth: AuthContext, id: string): Promise<CustomerView> {
    assertCustomerAccess(auth, id);
    return this.load(this.db, id);
  }

  async create(auth: AuthContext, input: CustomerInput): Promise<CustomerView> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.document, input.document));
      if (existing) {
        throw ApiException.conflict('Já existe cliente com este documento.', [
          { path: 'document', message: 'Documento já cadastrado' },
        ]);
      }
      const [row] = await tx
        .insert(customers)
        .values({
          kind: input.kind,
          name: input.name,
          tradeName: input.tradeName || null,
          document: input.document,
          createdByAccountId: auth.account.id,
        })
        .returning({ id: customers.id });
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'cliente.criado',
        entityType: 'customer',
        entityId: row.id,
      });
      return this.load(tx, row.id);
    });
  }

  async addContact(
    auth: AuthContext,
    customerId: string,
    input: ContactInput,
  ): Promise<ContactView> {
    return this.db.transaction(async (tx) => {
      await this.load(tx, customerId);
      const [duplicate] = await tx
        .select({ id: customerContacts.id })
        .from(customerContacts)
        .where(
          and(
            eq(customerContacts.customerId, customerId),
            eq(customerContacts.email, input.email),
          ),
        );
      if (duplicate) {
        throw ApiException.conflict(
          'Este cliente já possui contato com este e-mail.',
          [{ path: 'email', message: 'E-mail já cadastrado para o cliente' }],
        );
      }
      const [row] = await tx
        .insert(customerContacts)
        .values({
          customerId,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
        })
        .returning();
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'cliente.contato_adicionado',
        entityType: 'customer',
        entityId: customerId,
        data: { contactId: row.id },
      });
      return toContact(row);
    });
  }

  private async load(db: Executor, id: string): Promise<CustomerView> {
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    if (!row) throw ApiException.notFound('Cliente não encontrado.');
    const contacts = await db
      .select()
      .from(customerContacts)
      .where(eq(customerContacts.customerId, id))
      .orderBy(asc(customerContacts.name));
    return { ...toSummary(row), contacts: contacts.map(toContact) };
  }
}
