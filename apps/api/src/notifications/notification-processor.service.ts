import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import { notifications } from '../database/schema/index.js';
import { MAIL_TRANSPORT, type MailTransport } from './mail-transport.js';
import { redactPayload, renderNotification } from './templates.js';

const BATCH_SIZE = 10;
const LOCK_SECONDS = 120;
const MAX_BACKOFF_SECONDS = 3600;

/** Espera exponencial entre tentativas: 30 s, 60 s, 120 s… até 1 h. */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_SECONDS);
}

/**
 * Processa a fila de avisos. Várias instâncias podem rodar ao mesmo tempo:
 * cada lote é reservado com `FOR UPDATE SKIP LOCKED`, e reservas vencidas
 * (processo interrompido) voltam a ser elegíveis. A entrega é "pelo menos
 * uma vez": se o SMTP aceitar e a gravação do resultado falhar, o aviso pode repetir.
 */
@Injectable()
export class NotificationProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(NotificationProcessor.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<unknown> | undefined;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.NOTIFICATIONS_WORKER_ENABLED) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.processBatch()
        .catch((error: unknown) =>
          this.logger.error('Falha ao processar avisos', error as Error),
        )
        .finally(() => (this.running = undefined));
    }, this.env.NOTIFICATIONS_POLL_SECONDS * 1000);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Processa um lote; devolve quantos avisos foram tentados. */
  async processBatch(): Promise<number> {
    const claimable = this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        or(
          and(
            eq(notifications.status, 'pendente'),
            lte(notifications.nextAttemptAt, sql`now()`),
          ),
          and(
            eq(notifications.status, 'enviando'),
            lt(notifications.lockedUntil, sql`now()`),
          ),
        ),
      )
      .orderBy(asc(notifications.nextAttemptAt))
      .limit(BATCH_SIZE)
      .for('update', { skipLocked: true });

    const claimed = await this.db
      .update(notifications)
      .set({
        status: 'enviando',
        attempts: sql`${notifications.attempts} + 1`,
        lockedUntil: sql`now() + make_interval(secs => ${LOCK_SECONDS})`,
      })
      .where(inArray(notifications.id, claimable))
      .returning();

    for (const notification of claimed) {
      await this.deliver(notification);
    }
    return claimed.length;
  }

  private async deliver(
    notification: typeof notifications.$inferSelect,
  ): Promise<void> {
    try {
      const message = renderNotification(
        notification.template,
        notification.payload,
      );
      await this.transport.send({ to: notification.recipient, ...message });
    } catch (error) {
      const exhausted = notification.attempts >= notification.maxAttempts;
      const reason = error instanceof Error ? error.message : String(error);
      await this.db
        .update(notifications)
        .set({
          status: exhausted ? 'falhou' : 'pendente',
          lockedUntil: null,
          lastError: reason.slice(0, 1000),
          nextAttemptAt: sql`now() + make_interval(secs => ${backoffSeconds(notification.attempts)})`,
        })
        .where(eq(notifications.id, notification.id));
      this.logger.warn(
        `Aviso ${notification.id} (${notification.template}) falhou na tentativa ${notification.attempts}${exhausted ? '; tentativas esgotadas' : ''}: ${reason}`,
      );
      return;
    }

    await this.db
      .update(notifications)
      .set({
        status: 'enviada',
        sentAt: sql`now()`,
        lockedUntil: null,
        lastError: null,
        payload: redactPayload(notification.payload),
      })
      .where(eq(notifications.id, notification.id));
  }
}
