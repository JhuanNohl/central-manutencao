import {
  PASSWORD_LENGTH,
  PASSWORD_REQUIREMENTS,
  passwordStrength,
  type PasswordStrength,
} from '@central/contracts';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { FieldErrors } from '../lib/forms';
import { Field } from './ui';

const STRENGTH: Record<PasswordStrength, { label: string; level: number }> = {
  fraca: { label: 'Fraca', level: 1 },
  mediana: { label: 'Mediana', level: 2 },
  forte: { label: 'Forte', level: 3 },
};

const LEVELS = [1, 2, 3] as const;

/** Os rótulos completam a frase de erro da API; na lista, viram itens. */
const sentenceCase = (label: string) =>
  label.charAt(0).toUpperCase() + label.slice(1);

/**
 * Senha nova com o índice de força e a lista de requisitos, que são os
 * mesmos da validação da API. Só a senha forte é aceita.
 */
export function NewPasswordField(props: {
  label: string;
  name: string;
  errors?: FieldErrors;
  errorPath?: string;
}) {
  const [password, setPassword] = useState('');
  const strength = passwordStrength(password);
  return (
    <div className="new-password">
      <Field
        {...props}
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_LENGTH.max}
        value={password}
        onChange={setPassword}
      />
      {password && (
        <div
          className={`password-strength strength-${strength}`}
          aria-live="polite"
        >
          <div className="strength-bar" aria-hidden>
            {LEVELS.map((level) => (
              <span
                key={level}
                className={level <= STRENGTH[strength].level ? 'filled' : ''}
              />
            ))}
          </div>
          <span>
            Força da senha: <strong>{STRENGTH[strength].label}</strong>
          </span>
        </div>
      )}
      <ul className="password-rules" aria-label="Requisitos da senha">
        {PASSWORD_REQUIREMENTS.map((requirement) => {
          const met = requirement.isMet(password);
          const Icon = met ? Check : X;
          return (
            <li key={requirement.label} className={met ? 'met' : undefined}>
              <Icon size={14} aria-hidden />
              <span>
                {sentenceCase(requirement.label)}
                <span className="visually-hidden">
                  {met ? ' (cumprido)' : ' (pendente)'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
