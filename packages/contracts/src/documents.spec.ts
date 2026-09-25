import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf, normalizeDocument } from './documents.js';
import { registerRequestSchema } from './index.js';

describe('mensagens de validação', () => {
  it('campo ausente é "Campo obrigatório"', () => {
    const result = registerRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((issue) => issue.message);
    expect(messages).toContain('Campo obrigatório');
  });
});

describe('documentos', () => {
  it('normaliza pontuação e caixa', () => {
    expect(normalizeDocument('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('valida CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('valida CNPJ numérico', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('valida CNPJ alfanumérico', () => {
    // Exemplo publicado pela Receita Federal.
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12.ABC.345/01DE-36')).toBe(false);
    // Dígitos verificadores são sempre numéricos.
    expect(isValidCnpj('12ABC34501DEA5')).toBe(false);
  });
});
