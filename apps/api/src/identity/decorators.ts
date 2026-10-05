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
export const ANY_OF_PERMISSIONS = 'central:any-of-permissions';
export const SENSITIVE_RATE_LIMIT = 'central:sensitive-rate-limit';
export const ALLOWED_BEFORE_PASSWORD_CHANGE =
  'central:allowed-before-password-change';

/** Rota acessível sem sessão (a sessão, se houver, ainda é carregada). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

/** Exige todas as permissões indicadas; verificado no backend a cada requisição. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/**
 * Exige ao menos uma das permissões, para rotas comuns ao portal e à equipe
 * (ex.: envio de arquivos). O escopo de cada perfil continua no serviço.
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_OF_PERMISSIONS, permissions);

/**
 * Rota liberada para quem ainda tem senha provisória: consultar a sessão,
 * trocar a senha e sair. O resto da API espera a troca.
 */
export const AllowedBeforePasswordChange = () =>
  SetMetadata(ALLOWED_BEFORE_PASSWORD_CHANGE, true);

/** Aplica o limite reduzido de tentativas (login, cadastro, links por e-mail). */
export const SensitiveRateLimit = () => SetMetadata(SENSITIVE_RATE_LIMIT, true);

export type AuthenticatedRequest = Request & { auth?: AuthContext };

/** Contexto da sessão; em rotas públicas pode ser `undefined`. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
