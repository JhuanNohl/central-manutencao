import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@central/contracts';
import type { Response } from 'express';
import { ApiException } from './api-exception.js';
import { currentRequestContext } from './request-context.js';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

const STATUS_MESSAGES: Partial<Record<number, string>> = {
  404: 'Recurso não encontrado.',
  429: 'Muitas tentativas. Aguarde um instante e tente novamente.',
};

/** Violação de unicidade do PostgreSQL, inclusive quando embrulhada pelo Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}

/** Converte qualquer erro para o envelope `{ error: { code, message } }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = currentRequestContext()?.requestId;
    const [status, body] = this.toBody(exception);
    body.error.requestId = requestId;

    if (status >= 500) {
      this.logger.error(
        `Erro não tratado rid=${requestId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    res.status(status).json(body);
  }

  private toBody(exception: unknown): [number, ApiErrorBody] {
    if (exception instanceof ApiException) {
      return [
        exception.getStatus(),
        {
          error: {
            code: exception.code,
            message: exception.message,
            issues: exception.issues,
          },
        },
      ];
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return [
        status,
        {
          error: {
            code: STATUS_CODES[status] ?? 'INTERNAL_ERROR',
            message:
              STATUS_MESSAGES[status] ??
              (status < 500 ? exception.message : 'Erro interno.'),
          },
        },
      ];
    }

    // Unicidade que escapou das verificações prévias (ex.: corrida entre duas requisições).
    if (isUniqueViolation(exception)) {
      return [
        HttpStatus.CONFLICT,
        {
          error: {
            code: 'CONFLICT',
            message: 'O registro já existe ou foi alterado simultaneamente.',
          },
        },
      ];
    }

    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erro interno. Informe o código da requisição à equipe.',
        },
      },
    ];
  }
}
