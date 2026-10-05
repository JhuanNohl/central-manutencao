import { Inject, Injectable, Logger } from '@nestjs/common';
import { warrantyTermsSchema, type WarrantyTerms } from '@central/contracts';
import { existsSync, readFileSync } from 'node:fs';
import { ApiException } from '../common/http/api-exception.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { TermsAcceptance } from './terms-acceptance.js';

const TERMS_REQUIRED = 'Leia e aceite o termo de garantia';

/** Termo neutro versionado, usado em desenvolvimento quando falta o da empresa. */
export const EXAMPLE_TERMS_FILE = 'legal/termo-garantia.exemplo.json';

function readTerms(path: string): WarrantyTerms {
  const result = warrantyTermsSchema.safeParse(
    JSON.parse(readFileSync(path, 'utf8')),
  );
  if (!result.success) {
    throw new Error(`Termo de garantia inválido em ${path}.`);
  }
  return result.data;
}

/**
 * Termo de garantia vigente. O texto é da empresa e não entra no repositório
 * público: fica no arquivo de `WARRANTY_TERMS_FILE`, lido na inicialização.
 */
@Injectable()
export class WarrantyTermsService {
  private readonly logger = new Logger(WarrantyTermsService.name);
  private readonly terms: WarrantyTerms;

  constructor(@Inject(ENV) env: Env) {
    this.terms = this.load(env);
  }

  current(): WarrantyTerms {
    return this.terms;
  }

  /** O aceite só vale para a versão vigente; se o termo mudou, o cliente lê de novo. */
  ensureCurrent(version: string): string {
    if (version !== this.terms.version) {
      throw ApiException.validation(
        [
          {
            path: 'termsVersion',
            message:
              'O termo de garantia foi atualizado. Leia a versão atual e aceite novamente.',
          },
        ],
        'O termo de garantia foi atualizado.',
      );
    }
    return this.terms.version;
  }

  /**
   * Aceite que vale na abertura pelo cliente: o enviado agora (`renewed`) ou,
   * sem ele, o que a conta já deu para a versão vigente.
   */
  acceptanceOnOpening(
    requested: string | undefined,
    accountVersion: string | null,
  ): TermsAcceptance {
    if (requested !== undefined) {
      return { version: this.ensureCurrent(requested), renewed: true };
    }
    if (accountVersion === this.terms.version) {
      return { version: accountVersion, renewed: false };
    }
    throw ApiException.validation(
      [{ path: 'termsVersion', message: TERMS_REQUIRED }],
      `${TERMS_REQUIRED}.`,
    );
  }

  private load(env: Env): WarrantyTerms {
    if (existsSync(env.WARRANTY_TERMS_FILE)) {
      return readTerms(env.WARRANTY_TERMS_FILE);
    }
    if (env.NODE_ENV === 'production') {
      throw new Error(
        `Em produção, o termo de garantia é obrigatório (${env.WARRANTY_TERMS_FILE}).`,
      );
    }
    this.logger.warn(
      `Termo de garantia não encontrado em ${env.WARRANTY_TERMS_FILE}; usando o modelo de exemplo.`,
    );
    return readTerms(EXAMPLE_TERMS_FILE);
  }
}
