/** Data e hora legíveis no fuso operacional (ex.: "02/10/2026, 14:30"). */
export function formatInstant(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}
