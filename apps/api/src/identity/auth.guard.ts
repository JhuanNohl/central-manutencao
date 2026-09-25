import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@central/contracts';
import { ApiException } from '../common/http/api-exception.js';
import { can } from './auth-context.js';
import {
  type AuthenticatedRequest,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS,
} from './decorators.js';
import { SESSION_COOKIE } from './session-cookie.js';
import { SessionsService } from './sessions.service.js';

/**
 * Guard global: toda rota exige sessão válida, salvo `@Public()`.
 * Em seguida confere as permissões de `@RequirePermissions()` (classe e método).
 * O escopo por cliente é verificado nos serviços, junto da consulta.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const targets = [context.getHandler(), context.getClass()];

    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0 && token.length <= 128) {
      req.auth = (await this.sessions.resolve(token)) ?? undefined;
    }

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }
    if (!req.auth) throw ApiException.unauthenticated();

    const required = [
      ...(this.reflector.get<Permission[]>(
        REQUIRED_PERMISSIONS,
        context.getClass(),
      ) ?? []),
      ...(this.reflector.get<Permission[]>(
        REQUIRED_PERMISSIONS,
        context.getHandler(),
      ) ?? []),
    ];
    const auth = req.auth;
    if (!required.every((permission) => can(auth, permission))) {
      throw ApiException.forbidden();
    }
    return true;
  }
}
