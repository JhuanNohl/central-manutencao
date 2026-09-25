import { opaqueTokenSchema } from '@central/contracts';
import { generateToken, hashToken } from './tokens.js';

describe('tokens', () => {
  it('gera tokens distintos e aceitos pelo contrato', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(opaqueTokenSchema.safeParse(a).success).toBe(true);
  });

  it('hash é determinístico e não contém o token', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});
