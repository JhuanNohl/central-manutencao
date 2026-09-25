import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from './api-exception.js';

/** Valida e normaliza a entrada com um esquema dos contratos compartilhados. */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw ApiException.validation(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
}

export const validate = <T extends z.ZodType>(schema: T) =>
  new ZodValidationPipe(schema);
