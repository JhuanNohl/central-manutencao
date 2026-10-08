import { CAPTCHA_HEADER } from '@central/contracts';
import type { CaptchaVerifier } from '../src/common/captcha/captcha-verifier.js';
import { LOGIN_FAILURES_LIMIT } from '../src/identity/login-attempts.js';
import {
  createAccount,
  createTestApp,
  PASSWORD,
  resetDatabase,
  type TestContext,
} from './support.js';

/** Dublê do Turnstile: só o token "valido" passa, uma vez. */
class FakeCaptcha implements CaptchaVerifier {
  readonly enabled = true;
  readonly seenIps: (string | undefined)[] = [];

  verify(token: string, remoteIp: string | undefined): Promise<boolean> {
    this.seenIps.push(remoteIp);
    return Promise.resolve(token === 'valido');
  }
}

describe('Verificação anti-robô (Turnstile) e limite de tentativas no acesso', () => {
  let ctx: TestContext;
  const captcha = new FakeCaptcha();

  beforeAll(async () => {
    ctx = await createTestApp({ captcha });
  });
  afterAll(() => ctx.app.close());
  beforeEach(async () => {
    await resetDatabase(ctx.db);
    await createAccount(ctx.db, {
      email: 'agente@central.local',
      role: 'agente',
    });
  });

  const login = (email = 'agente@central.local', password = PASSWORD) =>
    ctx.http().post('/api/auth/login').send({ email, password });

  it('cadastro e pedido de redefinição de senha exigem o token', async () => {
    const register = await ctx
      .http()
      .post('/api/auth/register')
      .send({})
      .expect(400);
    expect(register.body.error.code).toBe('CAPTCHA_FAILED');
    const resetRequest = () =>
      ctx
        .http()
        .post('/api/auth/password-reset/request')
        .send({ email: 'agente@central.local' });
    const refused = await resetRequest()
      .set(CAPTCHA_HEADER, 'falso')
      .expect(400);
    expect(refused.body.error.code).toBe('CAPTCHA_FAILED');

    await resetRequest().set(CAPTCHA_HEADER, 'valido').expect(202);
    expect(captcha.seenIps.at(-1)).toBeTruthy();
  });

  it('o login dispensa o token (decisão de 08/10/2026)', async () => {
    await login().expect(200);
  });

  it('senhas erradas seguidas bloqueiam o e-mail por um tempo, mesmo sem conta', async () => {
    await createAccount(ctx.db, {
      email: 'bloqueio@central.local',
      role: 'agente',
    });
    for (let attempt = 0; attempt < LOGIN_FAILURES_LIMIT; attempt++) {
      await login('bloqueio@central.local', 'Errada-123!').expect(401);
      await login('inexistente@central.local', 'Errada-123!').expect(401);
    }
    // Nem a senha certa entra durante o bloqueio; outros e-mails seguem normais.
    const blocked = await login('bloqueio@central.local').expect(429);
    expect(blocked.body.error.message).toContain('Muitas tentativas');
    await login('inexistente@central.local').expect(429);
    await login().expect(200);
  });

  it('rotas sem a marcação não pedem o token', async () => {
    await ctx.http().get('/api/legal/warranty-terms').expect(200);
    const config = await ctx.http().get('/api/captcha/config').expect(200);
    // Sem chaves no ambiente de teste, a web não exibe o widget.
    expect(config.body).toEqual({ siteKey: null });
  });
});
