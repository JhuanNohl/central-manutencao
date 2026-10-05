import { describe, expect, it } from 'vitest';
import { passwordSchema, passwordStrength } from './passwords.js';

describe('política de senha', () => {
  it('aceita a senha com maiúscula, número e caractere especial', () => {
    expect(passwordSchema.safeParse('Manut-2026').success).toBe(true);
    expect(passwordSchema.safeParse('Árvore#1').success).toBe(true);
  });

  it('lista na mensagem só o que falta', () => {
    const result = passwordSchema.safeParse('manutencao-2026');
    expect(result.error?.issues[0].message).toBe(
      'A senha precisa ter uma letra maiúscula.',
    );
    expect(passwordSchema.safeParse('abc').error?.issues[0].message).toBe(
      'A senha precisa ter pelo menos 8 caracteres, uma letra maiúscula, um número e um caractere especial (ex.: ! @ # $ -).',
    );
  });

  it('espaço não conta como caractere especial', () => {
    expect(passwordSchema.safeParse('Senha 2026').success).toBe(false);
  });

  it('classifica a força pelos requisitos cumpridos', () => {
    expect(passwordStrength('')).toBe('fraca');
    expect(passwordStrength('senhalonga')).toBe('fraca');
    expect(passwordStrength('Senhalonga1')).toBe('mediana');
    expect(passwordStrength('Senhalonga1!')).toBe('forte');
  });
});
