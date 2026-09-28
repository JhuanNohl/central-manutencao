import { Inject, Injectable } from '@nestjs/common';
import { formatInstant } from '../common/time/format.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** Páginas do frontend que recebem um token enviado por e-mail. */
export type EmailLinkPage = 'convite' | 'redefinir-senha' | 'confirmar-email';

/** Monta os links e textos de validade usados nos e-mails. */
@Injectable()
export class EmailLinks {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * O token vai no fragmento (`#token=`): não é enviado ao servidor nem
   * aparece em logs de acesso ou no cabeçalho Referer.
   */
  withToken(page: EmailLinkPage, token: string): string {
    return `${this.env.APP_ORIGIN}/${page}#token=${token}`;
  }

  /** Detalhe do atendimento no portal do cliente (exige sessão; sem token). */
  portalRma(number: number): string {
    return `${this.env.APP_ORIGIN}/atendimentos/${number}`;
  }

  /** Validade legível no fuso operacional. */
  expiry(date: Date): string {
    return formatInstant(date, this.env.OPERATIONAL_TIMEZONE);
  }
}
