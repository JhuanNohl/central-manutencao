import { Injectable } from '@nestjs/common';
import { currentRequestContext } from '../common/http/request-context.js';
import type { Executor } from '../database/database.types.js';
import { auditEvents } from '../database/schema/index.js';

export interface AuditEntry {
  actorAccountId: string | null;
  /** Verbo no formato `entidade.acao`, ex.: `conta.desativada`. */
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  data?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  /** Grava no mesmo executor (transação) da operação auditada. */
  async record(db: Executor, entry: AuditEntry): Promise<void> {
    await db.insert(auditEvents).values({
      ...entry,
      reason: entry.reason ?? null,
      data: entry.data ?? null,
      requestId: currentRequestContext()?.requestId ?? null,
    });
  }
}
