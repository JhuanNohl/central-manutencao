import { Inject, Injectable } from '@nestjs/common';
import {
  ASSIGNABLE_ROLES,
  isCancellable,
  itemsToReturn,
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
import { cancellationNote } from './rma-cancellation.js';
import { insertRmaInternalNote } from './rma-internal-notes.service.js';
import { itemLine } from './rma-presentation.js';
import { findRma, lockOpenRma } from './rma-scope.js';
import { RmaTeamNotices } from './rma-team-notices.js';
import { RmaRequesterNotices } from './rma-requester-notices.js';

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
    private readonly requester: RmaRequesterNotices,
    private readonly audit: AuditService,
    private readonly team: RmaTeamNotices,
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
      if (assignee) await this.notifyAssignee(tx, current, assignee);
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
   * ficam no chamado e no histórico, com os documentos fiscais. O que já está
   * na fábrica entra em processo de devolução: a nota interna registra o que
   * volta, o cliente recebe a lista por e-mail e a conversa segue aberta para
   * combinar a devolução.
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
        .select({
          id: rmaItems.id,
          stage: rmaItems.stage,
          model: rmaItems.model,
          serialNumber: rmaItems.serialNumber,
        })
        .from(rmaItems)
        .where(eq(rmaItems.rmaId, rma.id))
        .orderBy(asc(rmaItems.position));
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
      const toReturn = itemsToReturn(items);
      const returnLines = toReturn.map(itemLine);
      await insertRmaInternalNote(
        tx,
        rma.id,
        auth.account,
        cancellationNote(request.reason, returnLines),
      );
      await this.audit.record(tx, {
        actorAccountId: auth.account.id,
        action: 'rma.cancelado',
        entityType: 'rma',
        entityId: rma.id,
        reason: request.reason,
        data: { itemsToReturn: toReturn.map((item) => item.id) },
      });

      await this.requester.notify(
        tx,
        current,
        'rma_cancelado',
        { reason: request.reason, returning: returnLines },
        `rma_cancelado:${rma.id}`,
      );
      await this.team.notify(tx, current, 'cancelado', {
        reason: request.reason,
      });
      return {
        cancelledAt: cancelledAt.toISOString(),
        reason: request.reason,
        cancelledBy: { id: auth.account.id, name: auth.account.name },
      };
    });
  }

  /** O solicitante fica sabendo quem cuida do chamado (decisão de 02/10/2026). */
  private async notifyAssignee(
    tx: Executor,
    rma: { id: string; number: number; requesterContactId: string | null },
    assignee: AssigneeOption,
  ): Promise<void> {
    await this.requester.notify(tx, rma, 'rma_responsavel', {
      assigneeName: assignee.name,
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
