import { Inject, Injectable } from '@nestjs/common';
import type {
  RmaMessageSide,
  RmaMessageView,
  SendRmaMessageRequest,
} from '@central/contracts';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import type {
  Database,
  Executor,
  Transaction,
} from '../database/database.types.js';
import { accounts, rmaMessages } from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { findRequesterContact } from './rma-customer.js';
import { findOwnRma, findRma, type RmaRow } from './rma-scope.js';

/**
 * Uma conversa ativa gera no máximo um e-mail por lado nesta janela: o aviso
 * chama para o sistema, e as mensagens seguintes já aparecem lá.
 */
const MESSAGE_NOTICE_WINDOW_MS = 30 * 60_000;

type MessageRow = typeof rmaMessages.$inferSelect & { authorName: string };

/** Mesma chave durante a janela: o outbox ignora o segundo aviso. */
function noticeKey(rmaId: string, side: RmaMessageSide, now: Date): string {
  const window = Math.floor(now.getTime() / MESSAGE_NOTICE_WINDOW_MS);
  return `rma_mensagem:${rmaId}:${side}:${window}`;
}

/**
 * Conversa do chamado entre o cliente e a equipe. O cliente só alcança os
 * próprios atendimentos (CA04) e não vê o nome de quem responde pela equipe.
 */
@Injectable()
export class RmaMessagesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  async listForStaff(
    auth: AuthContext,
    number: number,
  ): Promise<RmaMessageView[]> {
    const rma = await findRma(this.db, number);
    const rows = await this.messagesOf(this.db, rma.id);
    return rows.map((row) => toView(row, auth, row.authorName));
  }

  async listForCustomer(
    auth: AuthContext,
    number: number,
  ): Promise<RmaMessageView[]> {
    const rma = await findOwnRma(this.db, auth, number);
    const rows = await this.messagesOf(this.db, rma.id);
    return rows.map((row) =>
      toView(row, auth, row.authorSide === 'cliente' ? row.authorName : null),
    );
  }

  async sendAsStaff(
    auth: AuthContext,
    number: number,
    request: SendRmaMessageRequest,
  ): Promise<RmaMessageView> {
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      const row = await this.insert(tx, rma, auth, 'equipe', request.body);
      const requester = await findRequesterContact(tx, rma);
      if (requester) {
        await this.notifications.enqueue(tx, {
          template: 'rma_mensagem_equipe',
          recipient: requester.email,
          payload: {
            name: requester.name,
            number: String(rma.number),
            link: this.links.portalRma(rma.number),
          },
          origin: `rma:${rma.id}`,
          dedupeKey: noticeKey(rma.id, 'equipe', row.createdAt),
        });
      }
      return toView(row, auth, row.authorName);
    });
  }

  async sendAsCustomer(
    auth: AuthContext,
    number: number,
    request: SendRmaMessageRequest,
  ): Promise<RmaMessageView> {
    const rma = await findOwnRma(this.db, auth, number);
    return this.db.transaction(async (tx) => {
      const row = await this.insert(tx, rma, auth, 'cliente', request.body);
      await this.notifyAssignee(tx, rma, auth, row.createdAt);
      return toView(row, auth, row.authorName);
    });
  }

  /** Sem responsável, o chamado já aparece em "Requer atenção" para a equipe. */
  private async notifyAssignee(
    tx: Transaction,
    rma: RmaRow,
    auth: AuthContext,
    sentAt: Date,
  ): Promise<void> {
    if (!rma.assigneeAccountId) return;
    const [assignee] = await tx
      .select({ name: accounts.name, email: accounts.email })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, rma.assigneeAccountId),
          eq(accounts.status, 'ativa'),
        ),
      );
    if (!assignee) return;
    await this.notifications.enqueue(tx, {
      template: 'rma_mensagem_cliente',
      recipient: assignee.email,
      payload: {
        name: assignee.name,
        number: String(rma.number),
        customerName: auth.account.customer?.name ?? auth.account.name,
        link: this.links.staffRma(rma.number),
      },
      origin: `rma:${rma.id}`,
      dedupeKey: noticeKey(rma.id, 'cliente', sentAt),
    });
  }

  private async insert(
    tx: Transaction,
    rma: RmaRow,
    auth: AuthContext,
    side: RmaMessageSide,
    body: string,
  ): Promise<MessageRow> {
    const [row] = await tx
      .insert(rmaMessages)
      .values({
        rmaId: rma.id,
        authorAccountId: auth.account.id,
        authorSide: side,
        body,
      })
      .returning();
    return { ...row, authorName: auth.account.name };
  }

  private messagesOf(db: Executor, rmaId: string): Promise<MessageRow[]> {
    return db
      .select({ ...getTableColumns(rmaMessages), authorName: accounts.name })
      .from(rmaMessages)
      .innerJoin(accounts, eq(accounts.id, rmaMessages.authorAccountId))
      .where(eq(rmaMessages.rmaId, rmaId))
      .orderBy(asc(rmaMessages.createdAt), asc(rmaMessages.id));
  }
}

function toView(
  row: MessageRow,
  auth: AuthContext,
  authorName: string | null,
): RmaMessageView {
  return {
    id: row.id,
    body: row.body,
    sentAt: row.createdAt.toISOString(),
    side: row.authorSide,
    authorName,
    mine: row.authorAccountId === auth.account.id,
  };
}
