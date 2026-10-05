/**
 * Verificação anti-robô (Cloudflare Turnstile) nas rotas públicas mais
 * visadas por abuso: entrar, criar conta e pedir redefinição de senha.
 * O token do widget vai neste cabeçalho e vale uma única vez.
 */
export const CAPTCHA_HEADER = 'x-captcha-token';

/** Configuração pública do widget; `siteKey` nulo desliga a verificação. */
export interface CaptchaConfig {
  siteKey: string | null;
}
