import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const BASE = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://central:central@localhost:5433/central_test',
  APP_ORIGIN: 'http://localhost:5173',
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '25',
  MAIL_FROM: 'Central <teste@central.local>',
};

describe('endereço da fábrica (INVOICE_RECIPIENT_ADDRESS)', () => {
  it('lê logradouro, número, bairro, município e UF', () => {
    const env = parseEnv({
      ...BASE,
      INVOICE_RECIPIENT_ADDRESS:
        'Rua das Palmeiras; 100; Jardim São José ; Cidade Exemplo; SP',
    });
    expect(env.INVOICE_RECIPIENT_ADDRESS).toEqual({
      street: 'Rua das Palmeiras',
      number: '100',
      district: 'Jardim São José',
      city: 'Cidade Exemplo',
      state: 'SP',
    });
  });

  it('é opcional', () => {
    expect(parseEnv(BASE).INVOICE_RECIPIENT_ADDRESS).toBeUndefined();
  });

  it('recusa um endereço sem as cinco partes', () => {
    expect(() =>
      parseEnv({
        ...BASE,
        INVOICE_RECIPIENT_ADDRESS: 'Rua das Palmeiras, 100, Cidade Exemplo',
      }),
    ).toThrow('logradouro; número; bairro; município; UF');
  });
});
