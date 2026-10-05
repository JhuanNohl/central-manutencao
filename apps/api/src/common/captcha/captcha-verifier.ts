import { Logger } from '@nestjs/common';

/** Porta da verificação anti-robô; trocada por um dublê nos testes. */
export interface CaptchaVerifier {
  readonly enabled: boolean;
  verify(token: string, remoteIp: string | undefined): Promise<boolean>;
}

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Sem resposta da Cloudflare a tempo, a tentativa é recusada. */
const SITEVERIFY_TIMEOUT_MS = 5_000;

/** Validação do token no Cloudflare Turnstile, do lado do servidor. */
export class TurnstileVerifier implements CaptchaVerifier {
  readonly enabled = true;
  private readonly logger = new Logger(TurnstileVerifier.name);

  constructor(private readonly secretKey: string) {}

  async verify(token: string, remoteIp: string | undefined): Promise<boolean> {
    const form = new URLSearchParams({
      secret: this.secretKey,
      response: token,
    });
    if (remoteIp) form.set('remoteip', remoteIp);
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      });
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch (error) {
      // Falha fechada: sem confirmação, a rota protegida não executa.
      this.logger.warn(`Turnstile indisponível: ${String(error)}`);
      return false;
    }
  }
}

/** Sem chaves configuradas (desenvolvimento e testes): não há verificação. */
export class DisabledCaptchaVerifier implements CaptchaVerifier {
  readonly enabled = false;

  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
