import { Inject, Injectable } from '@nestjs/common';
import {
  ASSIGNABLE_ROLES,
  isCancellable,
  type AssigneeOption,
  type AssignRmaRequest,
  type CancelRmaRequest,
  type ChangePriorityRequest,
  type RmaAssignmentView,
  type RmaCancellationView,
  type RmaPriorityView,
} from '@central/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import { accounts, rmaItems, rmas } from '../database/schema/index.js';
import type { AuthContext } from '../identity/auth-context.js';
import { EmailLinks } from '../notifications/email-links.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { findRequesterContact } from './rma-customer.js';
import { findRma, lockOpenRma } from './rma-scope.js';

/** Condições de uma conta que pode assumir chamados. */
const assignable = and(
  inArray(accounts.role, [...ASSIGNABLE_ROLES]),
  eq(accounts.status, 'ativa'),
);

/**
 * Gestão do chamado pela equipe: responsável, prioridade e cancelamento.
 * Cada mudança bloqueia o RMA e grava o histórico na mesma transação.
 */
@Injectable()
export class RmaManagementService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly links: EmailLinks,
  ) {}

  /** Contas ativas que podem ser responsáveis, para a escolha na tela. */
  assignees(): Promise<AssigneeOption[]> {
    return this.db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(assignable)
      .orderBy(asc(accounts.name));
  }

  async assign(
    auth: AuthContext,
    number: number,
    request: AssignRmaRequest,
  ): Promise<RmaAssignmentView> {
    const rma = await findRma(this.db, number);
    const assignee = request.assigneeId
      ? await this.findAssignee(this.db, request.assigneeId)
      : null;
    return this.db.transaction(async (tx) => {
      const current = await lockOpenRma(tx, rma.id);
      // O bloqueio garante que ninguém assume o chamado entre a leitura e a gravação.
      if (current.assigneeAccountId !== request.expectedAssigneeId) {
        throw ApiException.conflict(
          'O responsável mudou enquanto você via o chamado. Confira e tente de novo.',
        );
      }
      if (current.assigneeAccountId === request.assigneeId) {
        return { assignee };
      }
      await tx
        .update(rmas)
        .set({ assigneeAccountId: request.assigneeId })
        .where(eq(rmas.id, rma.id));
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.responsavel_alterado',
        entityType: 'rma',
        entityId: rma.id,
        data: {
          before: current.assigneeAccountId,
          after: request.assigneeId,
        },
      });
      return { assignee };
    });
  }

  async changePriority(
    auth: AuthContext,
    number: number,
    request: ChangePriorityRequest,
  ): Promise<RmaPriorityView> {
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      const current = await lockOpenRma(tx, rma.id);
      if (current.priority === request.priority) return request;
      await tx
        .update(rmas)
        .set({ priority: request.priority })
        .where(eq(rmas.id, rma.id));
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.prioridade_alterada',
        entityType: 'rma',
        entityId: rma.id,
        data: { before: current.priority, after: request.priority },
      });
      return request;
    });
  }

  /**
   * Cancela o chamado (ex.: o cliente desistiu da manutenção) até o despacho
   * do primeiro equipamento. Nada é apagado: quem cancelou, quando e por quê
   * ficam no chamado e no histórico, com os documentos fiscais.
   */
  async cancel(
    auth: AuthContext,
    number: number,
    request: CancelRmaRequest,
  ): Promise<RmaCancellationView> {
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      const current = await lockOpenRma(tx, rma.id);
      const items = await tx
        .select({ stage: rmaItems.stage })
        .from(rmaItems)
        .where(eq(rmaItems.rmaId, rma.id));
      if (!isCancellable(items)) {
        throw ApiException.conflict(
          'Só é possível cancelar antes do despacho de algum equipamento.',
        );
      }
      const cancelledAt = new Date();
      await tx
        .update(rmas)
        .set({
          cancelledAt,
          closedAt: cancelledAt,
          cancellationReason: request.reason,
          cancelledByAccountId: auth.account.id,
        })
        .where(eq(rmas.id, rma.id));
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.cancelado',
        entityType: 'rma',
        entityId: rma.id,
        reason: request.reason,
      });

      const requester = await findRequesterContact(tx, current);
      if (requester) {
        await this.notifications.enqueue(tx, {
          template: 'rma_cancelado',
          recipient: requester.email,
          payload: {
            name: requester.name,
            number: String(current.number),
            reason: request.reason,
            link: this.links.portalRma(current.number),
          },
          origin: `rma:${rma.id}`,
          dedupeKey: `rma_cancelado:${rma.id}`,
        });
      }
      return {
        cancelledAt: cancelledAt.toISOString(),
        reason: request.reason,
        cancelledBy: { id: auth.account.id, name: auth.account.name },
      };
    });
  }

  private async findAssignee(
    db: Executor,
    id: string,
  ): Promise<AssigneeOption> {
    const [account] = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.id, id), assignable));
    if (!account) {
      throw ApiException.validation([
        {
          path: 'assigneeId',
          message: 'Escolha uma conta ativa da equipe de manutenção',
        },
      ]);
    }
    return account;
  }
}
