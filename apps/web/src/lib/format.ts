/** Fuso operacional: instantes chegam em UTC e são exibidos no horário de Brasília. */
export const OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: OPERATIONAL_TIMEZONE,
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export { formatDocument } from '@central/contracts';
