import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomerNotesView,
  UpdateCustomerNotesRequest,
} from '@central/contracts';
import { eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { reference } from '../common/mapping.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import {
  accounts,
  customerNotes,
  customers,
} from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';

/**
 * Observações internas sobre o cliente, só da equipe: não fazem parte do
 * cadastro que o cliente vê. Texto vazio apaga as observações.
 */
@Injectable()
export class CustomerNotesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get(customerId: string): Promise<CustomerNotesView> {
    await this.ensureCustomer(this.db, customerId);
    return this.load(this.db, customerId);
  }

  async update(
    auth: AuthContext,
    customerId: string,
    request: UpdateCustomerNotesRequest,
  ): Promise<CustomerNotesView> {
    return this.db.transaction(async (tx) => {
      await this.ensureCustomer(tx, customerId);
      if (request.body) {
        await tx
          .insert(customerNotes)
          .values({
            customerId,
            body: request.body,
            updatedByAccountId: auth.account.id,
          })
          .onConflictDoUpdate({
            target: customerNotes.customerId,
            set: {
              body: request.body,
              updatedByAccountId: auth.account.id,
              updatedAt: sql`now()`,
            },
          });
      } else {
        await tx
          .delete(customerNotes)
          .where(eq(customerNotes.customerId, customerId));
      }
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'cliente.observacoes_alteradas',
        entityType: 'customer',
        entityId: customerId,
      });
      return this.load(tx, customerId);
    });
  }

  private async load(
    db: Executor,
    customerId: string,
  ): Promise<CustomerNotesView> {
    const [row] = await db
      .select({
        body: customerNotes.body,
        updatedAt: customerNotes.updatedAt,
        updatedById: accounts.id,
        updatedByName: accounts.name,
      })
      .from(customerNotes)
      .leftJoin(accounts, eq(accounts.id, customerNotes.updatedByAccountId))
      .where(eq(customerNotes.customerId, customerId));
    return {
      body: row?.body ?? '',
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row ? reference(row.updatedById, row.updatedByName) : null,
    };
  }

  private async ensureCustomer(db: Executor, id: string): Promise<void> {
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, id));
    if (!row) throw ApiException.notFound('Cliente não encontrado.');
  }
}
