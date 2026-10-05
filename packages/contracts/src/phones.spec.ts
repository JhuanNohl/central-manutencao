import { describe, expect, it } from 'vitest';
import { isValidPhone, maskPhone, phoneSchema } from './phones.js';

describe('telefone', () => {
  it('mascara celular e fixo com o código do país', () => {
    expect(maskPhone('11987654321')).toBe('+55 (11) 9 8765-4321');
    expect(maskPhone('(31) 3333-4444')).toBe('+55 (31) 3333-4444');
    expect(maskPhone('+55 11 98765 4321')).toBe('+55 (11) 9 8765-4321');
    expect(maskPhone('5511987654321')).toBe('+55 (11) 9 8765-4321');
  });

  it('é progressiva: o separador só vem com o dígito seguinte', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone('1')).toBe('+55 (1');
    expect(maskPhone('+55 (11')).toBe('+55 (11');
    expect(maskPhone('+55 (11) 9')).toBe('+55 (11) 9');
    expect(maskPhone('+55 (11) 9 8765')).toBe('+55 (11) 9 8765');
    expect(maskPhone('+55 (11) 9 8765-43210')).toBe('+55 (11) 9 8765-4321');
  });

  it('mantém o DDD 55 quando não há o "+"', () => {
    expect(maskPhone('55991234567')).toBe('+55 (55) 9 9123-4567');
  });

  it('valida o tamanho de celular e de fixo', () => {
    expect(isValidPhone('+55 (11) 9 8765-4321')).toBe(true);
    expect(isValidPhone('+55 (31) 3333-4444')).toBe(true);
    expect(isValidPhone('+55 (11) 9 8765-432')).toBe(false);
    expect(isValidPhone('+55 (31) 3333-44445')).toBe(false);
    expect(isValidPhone('+55 (01) 3333-4444')).toBe(false);
  });

  it('grava no formato da máscara e aceita vazio', () => {
    expect(phoneSchema.parse('(11) 98765-4321')).toBe('+55 (11) 9 8765-4321');
    expect(phoneSchema.parse('')).toBe('');
    expect(phoneSchema.safeParse('1234').success).toBe(false);
  });
});
