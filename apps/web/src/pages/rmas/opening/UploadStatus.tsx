import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import type { UploadSlot } from './draft';

const STATUS = {
  enviando: { icon: LoaderCircle, label: 'Enviando…' },
  enviado: { icon: CircleCheck, label: 'Enviado' },
  erro: { icon: CircleAlert, label: 'Não enviado' },
} as const;

/** Andamento do envio por extenso, com ícone; a cor nunca é o único sinal. */
export function UploadStatus({ slot }: { slot: UploadSlot }) {
  const { icon: Icon, label } = STATUS[slot.status];
  return (
    <span className={`upload-status upload-${slot.status}`}>
      <Icon size={16} aria-hidden />
      {slot.error ?? label}
    </span>
  );
}
