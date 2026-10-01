import { Inject, Injectable } from '@nestjs/common';
import {
  VALIDATION_VIDEO_STAGES,
  type AttachValidationVideoRequest,
  type ValidationVideoView,
} from '@central/contracts';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { ApiException } from '../common/http/api-exception.js';
import { DATABASE } from '../database/database.module.js';
import type { Database } from '../database/database.types.js';
import {
  files,
  rmaItems,
  rmaValidationVideos,
} from '../database/schema/index.js';
import { claimTemporaryFiles, UNAVAILABLE_FILE } from '../files/file-links.js';
import { toValidationVideo } from './rma-media.js';
import { touchRma } from './rma-movements.js';
import { findRma, lockOpenRma } from './rma-scope.js';

export const VALIDATION_VIDEO_STAGE_MESSAGE =
  'O vídeo de validação é gravado com o equipamento em testes ou pronto para devolução.';

/** Quem anexa: a conta da sessão no computador ou a que gerou o QR Code. */
export interface ValidationVideoActor {
  id: string;
  name: string;
}

/**
 * Vídeo do equipamento funcionando, gravado pela equipe nas etapas finais.
 * É a evidência exigida para o despacho e fica visível ao cliente.
 */
@Injectable()
export class RmaValidationVideosService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async attach(
    actor: ValidationVideoActor,
    number: number,
    itemId: string,
    request: AttachValidationVideoRequest,
  ): Promise<ValidationVideoView> {
    const rma = await findRma(this.db, number);
    return this.db.transaction(async (tx) => {
      await lockOpenRma(tx, rma.id);
      const [item] = await tx
        .select({ stage: rmaItems.stage })
        .from(rmaItems)
        .where(and(eq(rmaItems.id, itemId), eq(rmaItems.rmaId, rma.id)));
      if (!item) throw ApiException.notFound('Equipamento não encontrado.');
      if (!VALIDATION_VIDEO_STAGES.includes(item.stage)) {
        throw ApiException.conflict(VALIDATION_VIDEO_STAGE_MESSAGE);
      }

      const claimed = await claimTemporaryFiles(
        tx,
        actor.id,
        'video_validacao',
        [request.fileId],
      );
      if (!claimed.has(request.fileId)) {
        throw ApiException.validation([
          { path: 'fileId', message: UNAVAILABLE_FILE },
        ]);
      }

      const [previous] = await tx
        .select({ fileId: rmaValidationVideos.fileId })
        .from(rmaValidationVideos)
        .where(eq(rmaValidationVideos.itemId, itemId));
      // Um novo vídeo substitui o anterior, que segue guardado e citado no histórico.
      const values = {
        fileId: request.fileId,
        recordedByAccountId: actor.id,
        recordedAt: new Date(),
      };
      const [video] = await tx
        .insert(rmaValidationVideos)
        .values({ itemId, ...values })
        .onConflictDoUpdate({ target: rmaValidationVideos.itemId, set: values })
        .returning();
      await touchRma(tx, rma.id);
      await this.audit.record(tx, {
        actorAccountId: actor.id,
        action: 'rma.video_validacao_anexado',
        entityType: 'rma',
        entityId: rma.id,
        data: {
          itemId,
          fileId: request.fileId,
          replacedFileId: previous?.fileId ?? null,
        },
      });

      const [file] = await tx
        .select()
        .from(files)
        .where(eq(files.id, request.fileId));
      return toValidationVideo(video, file, actor.name);
    });
  }
}
