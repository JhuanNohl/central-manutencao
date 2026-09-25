import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
const logger = new Logger('HTTP');

/**
 * Atribui um identificador a cada requisição (aceita `X-Request-Id` válido),
 * devolve-o na resposta e registra método, rota, status e duração.
 * Corpo, query string e cabeçalhos sensíveis não são registrados.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);

  const startedAt = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - startedAt);
    logger.log(
      `${req.method} ${req.path} ${res.statusCode} ${ms}ms rid=${requestId}`,
    );
  });

  storage.run(
    {
      requestId,
      ip: req.ip ?? null,
      userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
    },
    () => next(),
  );
}
