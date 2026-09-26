import type { LucideIcon } from 'lucide-react';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

/** Aparência de uma situação: rótulo, tom e ícone. */
export interface StatusStyle {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
}

/** Situação com ícone e fundo suave; a cor nunca é o único indicador. */
export function Badge({ status }: { status: StatusStyle }) {
  const Icon = status.icon;
  return (
    <span className={`badge badge-${status.tone}`}>
      <Icon size={16} aria-hidden />
      {status.label}
    </span>
  );
}
