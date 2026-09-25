import { Inject, Injectable } from '@nestjs/common';
import {
  isStaffRole,
  type AccountStatusChangeRequest,
  type AccountView,
  type ChangeRoleRequest,
  type ListAccountsQuery,
  type Page,
} from '@central/contracts';
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type {
  Database,
  Executor,
  Transaction,
} from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
} from '../database/schema/index.js';
import type { AuthContext } from './auth-context.js';
import { SessionsService } from './sessions.service.js';

/** Chave do lock consultivo que serializa mudanças de administradores. */
const ADMIN_CHANGES_LOCK = 7_301_001;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAccountsQuery): Promise<Page<AccountView>> {
    const term = query.search ? `%${escapeLike(query.search)}%` : undefined;
    const where = and(
      term
        ? or(ilike(accounts.name, term), ilike(accounts.email, term))
        : undefined,
      query.role ? eq(accounts.role, query.role) : undefined,
      query.status ? eq(accounts.status, query.status) : undefined,
    );
    const [rows, [{ total }]] = await Promise.all([
      this.selectViews()
        .where(where)
        .orderBy(asc(accounts.name))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(accounts).where(where),
    ]);
    return {
      items: rows.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async changeRole(
    auth: AuthContext,
    id: string,
    input: ChangeRoleRequest,
  ): Promise<AccountView> {
    if (id === auth.account.id) {
      throw ApiException.conflict('Você não pode alterar o próprio papel.');
    }
    await this.db.transaction(async (tx) => {
      await this.lockAdminChanges(tx);
      const target = await this.lockAccount(tx, id);
      if (!isStaffRole(target.role)) {
        throw ApiException.conflict(
          'Contas de cliente não recebem papéis da equipe.',
        );
      }
      if (target.role === input.role) return;
      if (target.role === 'administrador') {
        await this.assertAnotherActiveAdmin(tx, id);
      }
      await tx
        .update(accounts)
        .set({ role: input.role })
        .where(eq(accounts.id, id));
      // Sessões abertas passam a refletir o novo papel na próxima requisição.
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'conta.papel_alterado',
        entityType: 'account',
        entityId: id,
        reason: input.reason,
        data: { before: target.role, after: input.role },
      });
    });
    return this.get(id);
  }

  async disable(
    auth: AuthContext,
    id: string,
    input: AccountStatusChangeRequest,
  ): Promise<AccountView> {
    if (id === auth.account.id) {
      throw ApiException.conflict('Você não pode desativar a própria conta.');
    }
    await this.db.transaction(async (tx) => {
      await this.lockAdminChanges(tx);
      const target = await this.lockAccount(tx, id);
      if (target.status === 'desativada') return;
      if (target.role === 'administrador') {
        await this.assertAnotherActiveAdmin(tx, id);
      }
      await tx
        .update(accounts)
        .set({ status: 'desativada', disabledAt: sql`now()` })
        .where(eq(accounts.id, id));
      await this.sessions.revokeAll(tx, id);
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'conta.desativada',
        entityType: 'account',
        entityId: id,
        reason: input.reason,
      });
    });
    return this.get(id);
  }

  async enable(
    auth: AuthContext,
    id: string,
    input: AccountStatusChangeRequest,
  ): Promise<AccountView> {
    await this.db.transaction(async (tx) => {
      const target = await this.lockAccount(tx, id);
      if (target.status === 'ativa') return;
      await tx
        .update(accounts)
        .set({ status: 'ativa', disabledAt: null })
        .where(eq(accounts.id, id));
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'conta.reativada',
        entityType: 'account',
        entityId: id,
        reason: input.reason,
      });
    });
    return this.get(id);
  }

  /**
   * Serializa as alterações que podem remover um administrador. Tomado antes de
   * qualquer bloqueio de linha, evita que duas operações simultâneas deixem o
   * sistema sem administrador (e evita deadlock entre elas).
   */
  private async lockAdminChanges(tx: Transaction) {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_CHANGES_LOCK})`);
  }

  private async lockAccount(tx: Transaction, id: string) {
    const [row] = await tx
      .select({ role: accounts.role, status: accounts.status })
      .from(accounts)
      .where(eq(accounts.id, id))
      .for('update');
    if (!row) throw ApiException.notFound('Conta não encontrada.');
    return row;
  }

  /** Garante que sobra ao menos um administrador ativo (sob `lockAdminChanges`). */
  private async assertAnotherActiveAdmin(tx: Transaction, exceptId: string) {
    const admins = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.role, 'administrador'), eq(accounts.status, 'ativa')),
      );
    if (!admins.some((admin) => admin.id !== exceptId)) {
      throw ApiException.conflict(
        'É preciso manter pelo menos um administrador ativo.',
      );
    }
  }

  private selectViews(db: Executor = this.db) {
    return db
      .select({
        id: accounts.id,
        email: accounts.email,
        name: accounts.name,
        role: accounts.role,
        status: accounts.status,
        emailVerifiedAt: accounts.emailVerifiedAt,
        createdAt: accounts.createdAt,
        lastLoginAt: accounts.lastLoginAt,
        customerId: customers.id,
        customerName: customers.name,
      })
      .from(accounts)
      .leftJoin(customerContacts, eq(customerContacts.accountId, accounts.id))
      .leftJoin(customers, eq(customers.id, customerContacts.customerId))
      .$dynamic();
  }

  private async get(id: string): Promise<AccountView> {
    const [row] = await this.selectViews().where(eq(accounts.id, id));
    if (!row) throw ApiException.notFound('Conta não encontrada.');
    return toView(row);
  }
}

function toView(row: {
  id: string;
  email: string;
  name: string;
  role: AccountView['role'];
  status: AccountView['status'];
  emailVerifiedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  customerId: string | null;
  customerName: string | null;
}): AccountView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerifiedAt !== null,
    customer:
      row.customerId && row.customerName
        ? { id: row.customerId, name: row.customerName }
        : null,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}
