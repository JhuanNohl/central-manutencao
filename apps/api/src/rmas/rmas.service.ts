import { Inject, Injectable } from '@nestjs/common';
import type {
  ListRmasQuery,
  Page,
  RmaDetail,
  RmaItemStage,
  RmaSummary,
} from '@central/contracts';
import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { pageWindow, toPage } from '../common/db/pagination.js';
import { containsPattern } from '../common/db/search.js';
import { ApiException } from '../common/http/api-exception.js';
import { reference } from '../common/mapping.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import {
  accounts,
  customerContacts,
  customers,
  rmaInvoices,
  rmaItems,
  rmas,
} from '../database/schema/index.js';
import type { FileRow } from '../files/files.service.js';
import type { AuthContext } from '../identity/auth-context.js';
import {
  findRmaFile,
  groupBy,
  invoicesOf,
  itemsOf,
  loadDetailParts,
  toInvoice,
} from './rma-details.js';
import { rmaSubject, stageCounts } from './rma-presentation.js';

const assignee = alias(accounts, 'assignee');
const openedBy = alias(accounts, 'opened_by');

/** Colunas comuns à lista e ao detalhe. */
const headerColumns = {
  id: rmas.id,
  number: rmas.number,
  priority: rmas.priority,
  createdAt: rmas.createdAt,
  updatedAt: rmas.updatedAt,
  customerId: customers.id,
  customerName: customers.name,
  customerDocument: customers.document,
  requesterName: customerContacts.name,
  requesterEmail: customerContacts.email,
  requesterPhone: customerContacts.phone,
  assigneeId: assignee.id,
  assigneeName: assignee.name,
  openedById: openedBy.id,
  openedByName: openedBy.name,
};

type HeaderRow = Awaited<ReturnType<RmasService['selectHeaders']>>[number];

/**
 * Consulta de RMAs pela equipe. Notas internas são devolvidas aqui porque a
 * rota exige permissão da equipe; a futura visão do cliente não as expõe.
 */
@Injectable()
export class RmasService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    auth: AuthContext,
    query: ListRmasQuery,
  ): Promise<Page<RmaSummary>> {
    const where = and(
      this.searchFilter(query.search),
      query.stage ? this.hasItemIn(eq(rmaItems.stage, query.stage)) : undefined,
      query.priority ? eq(rmas.priority, query.priority) : undefined,
      this.assigneeFilter(auth, query.assignee),
    );
    const { limit, offset } = pageWindow(query);

    const headers = await this.selectHeaders()
      .where(where)
      .orderBy(desc(rmas.updatedAt), desc(rmas.number))
      .limit(limit)
      .offset(offset);
    const total = this.db
      .select({ total: count() })
      .from(rmas)
      .innerJoin(customers, eq(customers.id, rmas.customerId))
      .where(where);

    const ids = headers.map((row) => row.id);
    const [items, invoices] = ids.length
      ? await Promise.all([itemsOf(this.db, ids), invoicesOf(this.db, ids)])
      : [[], []];
    const itemsByRma = groupBy(items, (item) => item.rmaId);
    const invoicesByRma = groupBy(invoices, (invoice) => invoice.rmaId);

    return toPage(query, Promise.resolve(headers), total, (row) => {
      const firstInvoice = invoicesByRma.get(row.id)?.[0];
      return {
        ...this.toSummaryBase(row, itemsByRma.get(row.id) ?? []),
        requester: row.requesterName
          ? { name: row.requesterName, email: row.requesterEmail ?? '' }
          : null,
        invoice: firstInvoice ? toInvoice(firstInvoice) : null,
      };
    });
  }

  async get(number: number): Promise<RmaDetail> {
    const row = await this.findHeader(number);
    const parts = await loadDetailParts(this.db, row.id);
    return {
      ...this.toSummaryBase(row, parts.items),
      requester: row.requesterName
        ? {
            name: row.requesterName,
            email: row.requesterEmail ?? '',
            phone: row.requesterPhone,
          }
        : null,
      openedBy: reference(row.openedById, row.openedByName),
      ...parts,
    };
  }

  /** Foto ou documento do RMA, para a equipe com permissão de consulta. */
  async file(number: number, fileId: string): Promise<FileRow> {
    const row = await this.findHeader(number);
    const file = await findRmaFile(this.db, row.id, fileId);
    if (!file) throw ApiException.notFound('Arquivo não encontrado.');
    return file;
  }

  private async findHeader(number: number): Promise<HeaderRow> {
    const [row] = await this.selectHeaders().where(eq(rmas.number, number));
    if (!row) throw ApiException.notFound('Chamado não encontrado.');
    return row;
  }

  private selectHeaders() {
    return this.db
      .select(headerColumns)
      .from(rmas)
      .innerJoin(customers, eq(customers.id, rmas.customerId))
      .leftJoin(
        customerContacts,
        eq(customerContacts.id, rmas.requesterContactId),
      )
      .leftJoin(assignee, eq(assignee.id, rmas.assigneeAccountId))
      .leftJoin(openedBy, eq(openedBy.id, rmas.openedByAccountId))
      .$dynamic();
  }

  private toSummaryBase(
    row: HeaderRow,
    items: { model: string; serialNumber: string; stage: RmaItemStage }[],
  ) {
    return {
      number: row.number,
      subject: rmaSubject(items),
      priority: row.priority,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      customer: {
        id: row.customerId,
        name: row.customerName,
        document: row.customerDocument,
      },
      assignee: reference(row.assigneeId, row.assigneeName),
      itemCount: items.length,
      stages: stageCounts(items.map((item) => item.stage)),
    };
  }

  /** Nº do chamado, cliente, documento, modelo, nº de série ou nº da NF. */
  private searchFilter(search: string | undefined): SQL | undefined {
    const term = containsPattern(search);
    if (!term) return undefined;
    return or(
      ilike(sql`${rmas.number}::text`, term),
      ilike(customers.name, term),
      ilike(customers.document, term),
      this.hasItemIn(
        or(ilike(rmaItems.model, term), ilike(rmaItems.serialNumber, term)),
      ),
      exists(
        this.db
          .select({ one: sql`1` })
          .from(rmaInvoices)
          .where(
            and(
              eq(rmaInvoices.rmaId, rmas.id),
              or(
                ilike(rmaInvoices.number, term),
                ilike(rmaInvoices.issuerName, term),
              ),
            ),
          ),
      ),
    );
  }

  private hasItemIn(condition: SQL | undefined): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(rmaItems)
        .where(and(eq(rmaItems.rmaId, rmas.id), condition)),
    );
  }

  private assigneeFilter(
    auth: AuthContext,
    filter: ListRmasQuery['assignee'],
  ): SQL | undefined {
    if (filter === 'meus') return eq(rmas.assigneeAccountId, auth.account.id);
    if (filter === 'sem_responsavel') return isNull(rmas.assigneeAccountId);
    return undefined;
  }
}
