import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps, type KeyboardEvent } from 'react';
import { Field } from './ui';

/** Teclas que, mantidas pressionadas no botão, mostram a senha. */
const REVEAL_KEYS = [' ', 'Enter'];

/**
 * Campo de senha com o olho à direita: a senha aparece só enquanto o botão
 * fica pressionado (mouse, toque ou Espaço/Enter) e volta a ser ocultada ao
 * soltar, para não ficar exposta na tela por esquecimento.
 */
export function PasswordField(
  props: Omit<ComponentProps<typeof Field>, 'type' | 'action'>,
) {
  const [revealed, setRevealed] = useState(false);
  const hide = () => setRevealed(false);
  const onKey = (shown: boolean) => (event: KeyboardEvent) => {
    if (!REVEAL_KEYS.includes(event.key)) return;
    event.preventDefault();
    setRevealed(shown);
  };
  const Icon = revealed ? EyeOff : Eye;

  return (
    <Field
      {...props}
      type={revealed ? 'text' : 'password'}
      action={
        <button
          type="button"
          className="input-action reveal-password"
          aria-label="Mostrar a senha enquanto pressionado"
          aria-pressed={revealed}
          // Mantém o cursor no campo de senha enquanto se segura o botão.
          onPointerDown={(event) => {
            event.preventDefault();
            setRevealed(true);
          }}
          onPointerUp={hide}
          onPointerLeave={hide}
          onPointerCancel={hide}
          onKeyDown={onKey(true)}
          onKeyUp={onKey(false)}
          onBlur={hide}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Icon size={18} aria-hidden />
        </button>
      }
    />
  );
}
