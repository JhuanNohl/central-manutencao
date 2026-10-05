import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiException } from '../common/http/api-exception.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** Marca as rotas de envio para o limite `envio` do throttler. */
export const UPLOAD_RATE_LIMIT = 'central:upload-rate-limit';

/**
 * Envios em andamento no processo. O multipart fica na memória até o fim do
 * envio (vídeos de até 100 MB): sem este teto, envios simultâneos esgotam a
 * memória da API. Compartilhado por todas as rotas de envio.
 */
@Injectable()
export class UploadSlots {
  private active = 0;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Reserva uma vaga; devolve a função que a libera. */
  acquire(): () => void {
    if (this.active >= this.env.UPLOAD_MAX_CONCURRENT) {
      throw ApiException.tooManyRequests(
        'Muitos envios de arquivos ao mesmo tempo. Tente novamente em instantes.',
      );
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

/** Roda antes do interceptor do multipart: a vaga é reservada antes de o corpo chegar. */
@Injectable()
export class UploadSlotsGuard implements CanActivate {
  constructor(private readonly slots: UploadSlots) {}

  canActivate(context: ExecutionContext): boolean {
    const release = this.slots.acquire();
    context.switchToHttp().getResponse<Response>().once('close', release);
    return true;
  }
}

/** Limites das rotas de envio: tentativas por minuto e envios simultâneos. */
export const UploadLimits = () =>
  applyDecorators(
    SetMetadata(UPLOAD_RATE_LIMIT, true),
    UseGuards(UploadSlotsGuard),
  );
