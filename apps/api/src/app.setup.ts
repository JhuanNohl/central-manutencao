import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { requestContextMiddleware } from './common/http/request-context.js';

/**
 * Maior corpo JSON aceito: a abertura de um RMA com 200 equipamentos, com a
 * falha e as observações no tamanho máximo, fica perto de 700 KB.
 */
const JSON_BODY_LIMIT = '1mb';

/** Configuração HTTP comum à execução e aos testes de integração. */
export function configureApp(
  app: NestExpressApplication,
  options: { trustProxyHops: number; https: boolean },
): void {
  app.setGlobalPrefix('api');
  // Atrás do Traefik, o IP real do cliente vem do cabeçalho X-Forwarded-For.
  app.set('trust proxy', options.trustProxyHops);
  app.disable('x-powered-by');
  app.use(requestContextMiddleware);
  // HSTS só faz sentido sob HTTPS (produção atrás do Traefik).
  app.use(helmet({ strictTransportSecurity: options.https }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.enableShutdownHooks();
}
