import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Permission } from '@central/contracts';
import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';

export const PUBLIC_ROUTE = 'central:public';
export const REQUIRED_PERMISSIONS = 'central:permissions';
export const SENSITIVE_RATE_LIMIT = 'central:sensitive-rate-limit';

/** Rota acessível sem sessão (a sessão, se houver, ainda é carregada). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** Exige todas as permissões indicadas; verificado no backend a cada requisição. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Aplica o limite reduzido de tentativas (login, cadastro, links por e-mail). */
export const SensitiveRateLimit = () => SetMetadata(SENSITIVE_RATE_LIMIT, true);

export type AuthenticatedRequest = Request & { auth?: AuthContext };

/** Contexto da sessão; em rotas públicas pode ser `undefined`. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
