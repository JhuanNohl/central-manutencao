import { z } from 'zod';

/**
 * Política de senha forte (decisão de 02/10/2026): pelo menos 8 caracteres,
 * com letra maiúscula, número e caractere especial. A mesma lista alimenta a
 * validação da API e o indicador de força exibido enquanto a pessoa digita.
 */
export const PASSWORD_LENGTH = { min: 8, max: 128 } as const;

export interface PasswordRequirement {
  label: string;
  isMet: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  {
    label: `pelo menos ${PASSWORD_LENGTH.min} caracteres`,
    isMet: (password) => password.length >= PASSWORD_LENGTH.min,
  },
  {
    label: 'uma letra maiúscula',
    isMet: (password) => /\p{Lu}/u.test(password),
  },
  { label: 'um número', isMet: (password) => /\p{N}/u.test(password) },
  {
    label: 'um caractere especial (ex.: ! @ # $ -)',
    isMet: (password) => /[^\p{L}\p{N}\s]/u.test(password),
  },
];

export const PASSWORD_STRENGTHS = ['fraca', 'mediana', 'forte'] as const;
export type PasswordStrength = (typeof PASSWORD_STRENGTHS)[number];

/** Requisitos que faltam para a senha ser aceita. */
export function missingPasswordRequirements(
  password: string,
): PasswordRequirement[] {
  return PASSWORD_REQUIREMENTS.filter(
    (requirement) => !requirement.isMet(password),
  );
}

/** Forte é a senha que cumpre todos os requisitos; só ela é aceita. */
export function passwordStrength(password: string): PasswordStrength {
  const missing = missingPasswordRequirements(password).length;
  if (missing === 0) return 'forte';
  return missing === 1 ? 'mediana' : 'fraca';
}

function listing(parts: string[]): string {
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

export const passwordSchema = z
  .string()
  .max(
    PASSWORD_LENGTH.max,
    `A senha deve ter no máximo ${PASSWORD_LENGTH.max} caracteres`,
  )
  .superRefine((password, ctx) => {
    const missing = missingPasswordRequirements(password);
    if (missing.length === 0) return;
    ctx.addIssue({
      code: 'custom',
      message: `A senha precisa ter ${listing(missing.map((item) => item.label))}.`,
    });
  });
