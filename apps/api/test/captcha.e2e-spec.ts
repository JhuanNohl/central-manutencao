import { CAPTCHA_HEADER } from '@central/contracts';
import type { CaptchaVerifier } from '../src/common/captcha/captcha-verifier.js';
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

describe('Verificação anti-robô (Turnstile) nas rotas públicas', () => {
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

  const login = () =>
    ctx
      .http()
      .post('/api/auth/login')
      .send({ email: 'agente@central.local', password: PASSWORD });

  it('o login sem token, ou com token recusado, não chega a conferir a senha', async () => {
    const missing = await login().expect(400);
    expect(missing.body.error.code).toBe('CAPTCHA_FAILED');
    const refused = await login().set(CAPTCHA_HEADER, 'falso').expect(400);
    expect(refused.body.error.code).toBe('CAPTCHA_FAILED');

    await login().set(CAPTCHA_HEADER, 'valido').expect(200);
    expect(captcha.seenIps.at(-1)).toBeTruthy();
  });

  it('cadastro e pedido de redefinição de senha também exigem o token', async () => {
    const register = await ctx
      .http()
      .post('/api/auth/register')
      .send({})
      .expect(400);
    expect(register.body.error.code).toBe('CAPTCHA_FAILED');
    const reset = await ctx
      .http()
      .post('/api/auth/password-reset/request')
      .send({ email: 'agente@central.local' })
      .expect(400);
    expect(reset.body.error.code).toBe('CAPTCHA_FAILED');
  });

  it('rotas sem a marcação não pedem o token', async () => {
    await ctx.http().get('/api/legal/warranty-terms').expect(200);
    const config = await ctx.http().get('/api/captcha/config').expect(200);
    // Sem chaves no ambiente de teste, a web não exibe o widget.
    expect(config.body).toEqual({ siteKey: null });
  });
});
