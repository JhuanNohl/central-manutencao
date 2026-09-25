import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, FieldIssue } from '@central/contracts';

/** Erro de aplicação com código estável, traduzido para o envelope padrão. */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly issues?: FieldIssue[],
  ) {
    super(message, status);
  }

  static validation(issues: FieldIssue[], message = 'Dados inválidos.') {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      message,
      issues,
    );
  }

  static unauthenticated(message = 'Autenticação necessária.') {
    return new ApiException(
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
      message,
    );
  }

  static forbidden(message = 'Você não tem permissão para esta ação.') {
    return new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
  }

  static notFound(message = 'Registro não encontrado.') {
    return new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
  }

  static conflict(message: string, issues?: FieldIssue[]) {
    return new ApiException(HttpStatus.CONFLICT, 'CONFLICT', message, issues);
  }

  static invalidToken(message = 'O link é inválido ou expirou.') {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'INVALID_OR_EXPIRED_TOKEN',
      message,
    );
  }
}
