import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiException } from '../common/http/api-exception.js';

/** Maior valor da coluna `rmas.number` (integer do PostgreSQL). */
const MAX_RMA_NUMBER = 2_147_483_647;

/**
 * Número do chamado na URL. Fora do formato ou do tipo da coluna, o chamado
 * simplesmente não existe: responde 404 em vez de levar o erro ao banco.
 */
@Injectable()
export class RmaNumberPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const number = /^\d{1,10}$/.test(value) ? Number(value) : NaN;
    if (!(number >= 1 && number <= MAX_RMA_NUMBER)) {
      throw ApiException.notFound('Chamado não encontrado.');
    }
    return number;
  }
}
