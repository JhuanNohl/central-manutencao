import { TurnstileVerifier } from './captcha-verifier.js';

describe('TurnstileVerifier', () => {
  afterEach(() => vi.unstubAllGlobals());

  function respondWith(body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('aceita o token confirmado e envia a chave secreta e o IP', async () => {
    const fetchMock = respondWith({ success: true });
    await expect(
      new TurnstileVerifier('segredo').verify('token', '203.0.113.7'),
    ).resolves.toBe(true);

    const form = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(form.get('secret')).toBe('segredo');
    expect(form.get('response')).toBe('token');
    expect(form.get('remoteip')).toBe('203.0.113.7');
  });

  it('recusa o token não confirmado', async () => {
    respondWith({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(
      new TurnstileVerifier('segredo').verify('token', undefined),
    ).resolves.toBe(false);
  });

  it('falha fechada quando a Cloudflare não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(
      new TurnstileVerifier('segredo').verify('token', undefined),
    ).resolves.toBe(false);
  });
});
