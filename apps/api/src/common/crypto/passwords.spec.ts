import bcrypt from 'bcryptjs';
import { hashPassword, isLegacyHash, verifyPassword } from './passwords.js';

describe('senhas do sistema anterior', () => {
  // Hash do PHP (osTicket) usa o prefixo $2y$, equivalente ao $2b$.
  const legacy = bcrypt
    .hashSync('Senha-Antiga-1', 4)
    .replace(/^\$2b\$/, '$2y$');

  it('reconhece só o bcrypt do legado', async () => {
    expect(isLegacyHash(legacy)).toBe(true);
    expect(isLegacyHash(await hashPassword('Senha-Nova-1'))).toBe(false);
    expect(isLegacyHash('5f4dcc3b5aa765d61d8327deb882cf99')).toBe(false);
  });

  it('confere a senha contra o hash importado', async () => {
    await expect(verifyPassword(legacy, 'Senha-Antiga-1')).resolves.toBe(true);
    await expect(verifyPassword(legacy, 'outra')).resolves.toBe(false);
  });
});
