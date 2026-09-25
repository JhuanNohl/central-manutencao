import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { SESSION_COOKIE } from '../../identity/session-cookie.js';
import { ApiException } from './api-exception.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Proteção contra CSRF para a sessão em cookie (complementa SameSite=Lax):
 * requisições que alteram estado precisam vir da origem do frontend.
 * Sem Origin/Referer, só são aceitas se não carregarem cookie de sessão
 * (clientes que não são navegadores).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin =
      originOf(req.header('origin')) ?? originOf(req.header('referer'));
    const hasSession = Boolean(req.cookies?.[SESSION_COOKIE]);

    if (origin === this.env.APP_ORIGIN) return true;
    if (origin === null && !hasSession) return true;

    throw new ApiException(
      HttpStatus.FORBIDDEN,
      'INVALID_ORIGIN',
      'Origem da requisição não permitida.',
    );
  }
}
