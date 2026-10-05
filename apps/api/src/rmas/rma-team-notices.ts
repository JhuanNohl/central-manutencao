import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { Executor } from '../database/database.types.js';
import { accounts, customers, rmas } from '../database/schema/index.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { TeamRmaEvent } from '../notifications/team-events.js';

interface RmaRef {
  id: string;
  number: number;
}

/**
 * Avisos à caixa do setor de manutenção (`MAINTENANCE_INBOX_EMAIL`), com o
 * cliente e o responsável do chamado identificados. Sem caixa configurada,
 * como nos testes de unidade, nada é enviado.
 */
@Injectable()
export class RmaTeamNotices {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  /** Movimentação do chamado: abertura, envio, recebimento, etapa, cancelamento. */
  async notify(
    db: Executor,
    rma: RmaRef,
    event: TeamRmaEvent,
    details: { items?: string[]; reason?: string; shipping?: string } = {},
  ): Promise<void> {
    const inbox = this.env.MAINTENANCE_INBOX_EMAIL;
    if (!inbox) return;
    await this.notifications.enqueue(db, {
      template: 'equipe_rma',
      recipient: inbox,
      origin: `rma:${rma.id}`,
      payload: {
        ...(await this.contextOf(db, rma)),
        event,
        items: details.items ?? [],
        reason: details.reason ?? null,
        shipping: details.shipping ?? null,
      },
    });
  }

  /** Mensagem do cliente na conversa; `dedupeKey` agrupa a conversa ativa. */
  async customerMessage(
    db: Executor,
    rma: RmaRef,
    dedupeKey: string,
  ): Promise<void> {
    const inbox = this.env.MAINTENANCE_INBOX_EMAIL;
    if (!inbox) return;
    await this.notifications.enqueue(db, {
      template: 'rma_mensagem_cliente',
      recipient: inbox,
      origin: `rma:${rma.id}`,
      dedupeKey,
      payload: await this.contextOf(db, rma),
    });
  }

  /** Número, cliente, responsável atual e link do painel. */
  private async contextOf(db: Executor, rma: RmaRef) {
    const [row] = await db
      .select({ customerName: customers.name, assigneeName: accounts.name })
      .from(rmas)
      .innerJoin(customers, eq(customers.id, rmas.customerId))
      .leftJoin(accounts, eq(accounts.id, rmas.assigneeAccountId))
      .where(eq(rmas.id, rma.id));
    return {
      number: String(rma.number),
      customerName: row?.customerName ?? '',
      assigneeName: row?.assigneeName ?? null,
      link: this.links.staffRma(rma.number),
    };
  }
}
