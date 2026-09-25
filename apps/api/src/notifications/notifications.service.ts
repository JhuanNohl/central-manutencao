import { Inject, Injectable } from '@nestjs/common';
import type {
  ListNotificationsQuery,
  NotificationTemplate,
  NotificationView,
  Page,
} from '@central/contracts';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import { notifications } from '../database/schema/index.js';

export interface NotificationIntent {
  template: NotificationTemplate;
  recipient: string;
  payload: Record<string, unknown>;
  /** Referência da operação de origem, ex.: `invitation:<id>`. */
  origin: string;
  /** Mesma chave = mesmo aviso; uma segunda gravação é ignorada. */
  dedupeKey?: string;
}

type NotificationRow = typeof notifications.$inferSelect;

function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    template: row.template,
    recipient: row.recipient,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    nextAttemptAt:
      row.status === 'pendente' ? row.nextAttemptAt.toISOString() : null,
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
  ) {}

  /**
   * Registra a intenção de aviso no mesmo executor da operação de origem.
   * O envio acontece depois, pelo processador; se a transação falhar, o aviso some com ela.
   */
  async enqueue(db: Executor, intent: NotificationIntent): Promise<void> {
    await db
      .insert(notifications)
      .values({
        ...intent,
        dedupeKey: intent.dedupeKey ?? null,
        maxAttempts: this.env.NOTIFICATIONS_MAX_ATTEMPTS,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey });
  }

  async list(query: ListNotificationsQuery): Promise<Page<NotificationView>> {
    const where = query.status
      ? eq(notifications.status, query.status)
      : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(notifications).where(where),
    ]);
    return {
      items: rows.map(toView),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Reagenda um aviso que esgotou as tentativas, preservando o histórico de tentativas. */
  async retry(id: string, actorAccountId: string): Promise<NotificationView> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(notifications)
        .set({
          status: 'pendente',
          nextAttemptAt: sql`now()`,
          maxAttempts: sql`${notifications.attempts} + ${this.env.NOTIFICATIONS_MAX_ATTEMPTS}`,
        })
        .where(
          and(eq(notifications.id, id), eq(notifications.status, 'falhou')),
        )
        .returning();
      if (!row) {
        const [exists] = await tx
          .select({ id: notifications.id })
          .from(notifications)
          .where(eq(notifications.id, id));
        throw exists
          ? ApiException.conflict(
              'Somente avisos com falha podem ser reenviados.',
            )
          : ApiException.notFound('Aviso não encontrado.');
      }
      await this.audit.record(tx, {
        actorAccountId,
        action: 'notificacao.reagendada',
        entityType: 'notification',
        entityId: id,
        data: { attempts: row.attempts },
      });
      return toView(row);
    });
  }
}
