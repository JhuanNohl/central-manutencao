import { describe, expect, it } from 'vitest';
import {
  formatDocument,
  isValidCnpj,
  isValidCpf,
  maskDocument,
  normalizeDocument,
} from './documents.js';
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

  it('formata CPF e CNPJ, inclusive alfanumérico', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatDocument('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
    expect(formatDocument('123')).toBe('123');
  });

  it('mascara enquanto se digita, sem separador sobrando no fim', () => {
    expect(maskDocument('529', 'cpf')).toBe('529');
    expect(maskDocument('5299', 'cpf')).toBe('529.9');
    expect(maskDocument('529.982.247-251', 'cpf')).toBe('529.982.247-25');
    expect(maskDocument('11222333', 'cnpj')).toBe('11.222.333');
    expect(maskDocument('112223330001', 'cnpj')).toBe('11.222.333/0001');
    expect(maskDocument('12abc34501de35', 'cnpj')).toBe('12.ABC.345/01DE-35');
  });

  it('o CPF ignora letras e os dígitos verificadores do CNPJ são numéricos', () => {
    expect(maskDocument('52a9', 'cpf')).toBe('529');
    expect(maskDocument('12ABC34501DEX3', 'cnpj')).toBe('12.ABC.345/01DE-3');
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
