import { Inject, Injectable } from '@nestjs/common';
import {
  UPLOAD_SESSION_TTL_MINUTES,
  VALIDATION_VIDEO_STAGES,
  type CreateUploadSessionRequest,
  type UploadSessionCreated,
  type UploadSessionView,
} from '@central/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { generateToken, hashToken } from '../common/crypto/tokens.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import { rmaItems, rmas, uploadSessions } from '../database/schema/index.js';
import { toFileView } from '../files/files.service.js';
import { can, type AuthContext } from '../identity/auth-context.js';
import { EmailLinks } from '../notifications/email-links.js';
import { VALIDATION_VIDEO_STAGE_MESSAGE } from '../rmas/rma-validation-videos.service.js';
import { sessionFiles, type SessionRow } from './upload-session-queries.js';
import { sessionStatus } from './upload-session-rules.js';
import { MINUTE_MS } from '../common/time/durations.js';

type SessionTarget = Pick<
  SessionRow,
  'label' | 'rmaItemId' | 'photoLimit' | 'videoLimit'
>;

/**
 * QR Code de envio pelo celular, do lado do computador: gera a sessão de
 * validade curta, acompanha o que chegou e a encerra. O token só existe no
 * link, devolvido uma vez; o banco guarda o hash.
 */
@Injectable()
export class UploadSessionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly links: EmailLinks,
  ) {}

  async create(
    auth: AuthContext,
    request: CreateUploadSessionRequest,
  ): Promise<UploadSessionCreated> {
    const target: SessionTarget =
      request.kind === 'abertura'
        ? {
            label: request.label,
            rmaItemId: null,
            photoLimit: request.photoLimit,
            videoLimit: request.videoLimit,
          }
        : await this.validationTarget(auth, request);
    const token = generateToken();
    const [row] = await this.db
      .insert(uploadSessions)
      .values({
        ...target,
        tokenHash: hashToken(token),
        ownerAccountId: auth.account.id,
        kind: request.kind,
        expiresAt: new Date(
          Date.now() + UPLOAD_SESSION_TTL_MINUTES * MINUTE_MS,
        ),
      })
      .returning();
    return {
      id: row.id,
      url: this.links.withToken('enviar', token),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /** Acompanhamento no computador; só a conta que gerou o código. */
  async view(auth: AuthContext, id: string): Promise<UploadSessionView> {
    const row = await this.findOwn(auth, id);
    const sent = await sessionFiles(this.db, row.id);
    return {
      id: row.id,
      status: sessionStatus(row, new Date()),
      expiresAt: row.expiresAt.toISOString(),
      files: sent.map(toFileView),
    };
  }

  /** Fechar o QR Code invalida o link na hora. */
  async close(auth: AuthContext, id: string): Promise<void> {
    await this.findOwn(auth, id);
    await this.db
      .update(uploadSessions)
      .set({ closedAt: sql`now()` })
      .where(and(eq(uploadSessions.id, id), isNull(uploadSessions.closedAt)));
  }

  /** O vídeo de validação só é gravado nas etapas finais de um chamado aberto. */
  private async validationTarget(
    auth: AuthContext,
    request: Extract<CreateUploadSessionRequest, { kind: 'validacao' }>,
  ): Promise<SessionTarget> {
    if (!can(auth, 'rma.write')) throw ApiException.forbidden();
    const [item] = await this.db
      .select({
        id: rmaItems.id,
        model: rmaItems.model,
        serialNumber: rmaItems.serialNumber,
        stage: rmaItems.stage,
        closedAt: rmas.closedAt,
      })
      .from(rmaItems)
      .innerJoin(rmas, eq(rmas.id, rmaItems.rmaId))
      .where(
        and(
          eq(rmaItems.id, request.itemId),
          eq(rmas.number, request.rmaNumber),
        ),
      );
    if (!item) throw ApiException.notFound('Equipamento não encontrado.');
    if (item.closedAt || !VALIDATION_VIDEO_STAGES.includes(item.stage)) {
      throw ApiException.conflict(VALIDATION_VIDEO_STAGE_MESSAGE);
    }
    return {
      label: `${item.model} (S/N ${item.serialNumber})`,
      rmaItemId: item.id,
      photoLimit: 0,
      videoLimit: 1,
    };
  }

  private async findOwn(auth: AuthContext, id: string): Promise<SessionRow> {
    const [row] = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.id, id),
          eq(uploadSessions.ownerAccountId, auth.account.id),
        ),
      );
    if (!row) throw ApiException.notFound('Envio pelo celular não encontrado.');
    return row;
  }
}
