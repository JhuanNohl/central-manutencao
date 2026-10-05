import { Injectable } from '@nestjs/common';
import type { NotificationTemplate } from '@central/contracts';
import type { Executor } from '../database/database.types.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { findRequesterContact } from './rma-customer.js';

interface RmaRef {
  id: string;
  number: number;
  requesterContactId: string | null;
}

/** Avisos que o solicitante recebe ao longo do chamado. */
type RequesterTemplate = Extract<
  NotificationTemplate,
  | 'rma_etapa_alterada'
  | 'rma_itens_recebidos'
  | 'rma_responsavel'
  | 'rma_cancelado'
  | 'rma_mensagem_equipe'
>;

/**
 * Aviso ao solicitante do chamado, na transação da operação. Nome, número e
 * link do atendimento vão em todos; cada operação acrescenta os seus dados.
 * Chamado sem solicitante (contato removido) não gera aviso.
 */
@Injectable()
export class RmaRequesterNotices {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  async notify(
    db: Executor,
    rma: RmaRef,
    template: RequesterTemplate,
    details: Record<string, unknown> = {},
    dedupeKey?: string,
  ): Promise<void> {
    const requester = await findRequesterContact(db, rma);
    if (!requester) return;
    await this.notifications.enqueue(db, {
      template,
      recipient: requester.email,
      payload: {
        name: requester.name,
        number: String(rma.number),
        link: this.links.portalRma(rma.number),
        ...details,
      },
      origin: `rma:${rma.id}`,
      dedupeKey,
    });
  }
}
