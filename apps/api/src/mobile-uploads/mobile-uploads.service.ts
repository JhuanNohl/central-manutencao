import { Inject, Injectable } from '@nestjs/common';
import {
  UPLOAD_SESSION_PURPOSES,
  type MobileUploadMedia,
  type MobileUploadSessionView,
} from '@central/contracts';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { hashToken } from '../common/crypto/tokens.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database, Executor } from '../database/database.types.js';
import {
  accounts,
  uploadSessionFiles,
  uploadSessions,
} from '../database/schema/index.js';
import { FilesService } from '../files/files.service.js';
import {
  RmaValidationVideosService,
  type ValidationVideoActor,
} from '../rmas/rma-validation-videos.service.js';
import {
  rmaNumberOf,
  sessionFiles,
  type SessionRow,
} from './upload-session-queries.js';
import {
  mediaOf,
  ownerMayUpload,
  remainingOf,
  sessionStatus,
} from './upload-session-rules.js';

const EXPIRED =
  'Este QR Code expirou ou já foi usado. Gere outro no computador.';

const LIMIT_REACHED: Record<MobileUploadMedia, string> = {
  foto: 'Todas as fotos deste equipamento já foram enviadas.',
  video: 'O vídeo deste equipamento já foi enviado.',
};

/**
 * Lado do celular, sem login: o token do QR Code limita o envio ao
 * equipamento escolhido no computador. Os arquivos passam a ser da conta que
 * gerou o código, como se ela os tivesse enviado do computador.
 */
@Injectable()
export class MobileUploadsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly files: FilesService,
    private readonly validationVideos: RmaValidationVideosService,
  ) {}

  async describe(token: string): Promise<MobileUploadSessionView> {
    return this.toView(await this.findOpen(this.db, token));
  }

  async upload(
    token: string,
    media: MobileUploadMedia,
    name: string,
    content: Buffer,
  ): Promise<MobileUploadSessionView> {
    // O bloqueio da sessão serializa envios simultâneos: o limite vale mesmo
    // com várias fotos chegando ao mesmo tempo.
    const { session, owner, fileId } = await this.db.transaction(async (tx) => {
      const session = await this.findOpen(tx, token, true);
      const purpose = UPLOAD_SESSION_PURPOSES[session.kind][media];
      if (!purpose) {
        throw ApiException.validation([
          { path: 'media', message: 'Este envio aceita só o vídeo.' },
        ]);
      }
      const sent = await sessionFiles(tx, session.id);
      if (remainingOf(session, sent)[media] === 0) {
        throw ApiException.conflict(LIMIT_REACHED[media]);
      }
      const owner = await this.activeOwner(tx, session);
      const stored = await this.files.upload(
        owner.id,
        purpose,
        name,
        content,
        tx,
      );
      await tx
        .insert(uploadSessionFiles)
        .values({ sessionId: session.id, fileId: stored.id });
      return { session, owner, fileId: stored.id };
    });

    if (session.rmaItemId) {
      await this.attachValidationVideo(session.id, session.rmaItemId, {
        owner,
        fileId,
      });
    }
    const [fresh] = await this.db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, session.id));
    return this.toView(fresh);
  }

  /**
   * O vídeo de validação entra no chamado assim que chega, com as mesmas
   * regras do envio pelo computador. Se o item saiu das etapas finais, o
   * envio é desfeito e o celular pode tentar de novo.
   */
  private async attachValidationVideo(
    sessionId: string,
    itemId: string,
    upload: { owner: ValidationVideoActor; fileId: string },
  ): Promise<void> {
    try {
      const number = await rmaNumberOf(this.db, itemId);
      if (number === null) throw ApiException.notFound(EXPIRED);
      await this.validationVideos.attach(upload.owner, number, itemId, {
        fileId: upload.fileId,
      });
    } catch (error) {
      await this.db
        .delete(uploadSessionFiles)
        .where(eq(uploadSessionFiles.fileId, upload.fileId));
      throw error;
    }
    await this.db
      .update(uploadSessions)
      .set({ closedAt: sql`now()` })
      .where(eq(uploadSessions.id, sessionId));
  }

  private async findOpen(
    db: Executor,
    token: string,
    lock = false,
  ): Promise<SessionRow> {
    const query = db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.tokenHash, hashToken(token)),
          isNull(uploadSessions.closedAt),
          gt(uploadSessions.expiresAt, sql`now()`),
        ),
      )
      .$dynamic();
    const [row] = await (lock ? query.for('update') : query);
    if (!row) throw ApiException.notFound(EXPIRED);
    return row;
  }

  private async activeOwner(
    db: Executor,
    session: SessionRow,
  ): Promise<ValidationVideoActor> {
    const [owner] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        role: accounts.role,
        status: accounts.status,
      })
      .from(accounts)
      .where(eq(accounts.id, session.ownerAccountId));
    if (!owner || !ownerMayUpload(session.kind, owner)) {
      throw ApiException.notFound(EXPIRED);
    }
    return { id: owner.id, name: owner.name };
  }

  private async toView(row: SessionRow): Promise<MobileUploadSessionView> {
    const sent = await sessionFiles(this.db, row.id);
    const number = row.rmaItemId
      ? await rmaNumberOf(this.db, row.rmaItemId)
      : null;
    return {
      kind: row.kind,
      status: sessionStatus(row, new Date()),
      title: number === null ? 'Novo atendimento' : `Chamado #${number}`,
      label: row.label,
      expiresAt: row.expiresAt.toISOString(),
      remaining: remainingOf(row, sent),
      sent: sent.map((file) => ({
        name: file.originalName,
        media: mediaOf(row.kind, file),
      })),
    };
  }
}
