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

/** CPF (11) ou CNPJ (14, inclusive alfanumérico) com a pontuação usual. */
export function formatDocument(document: string): string {
  if (document.length === 11) {
    return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (document.length === 14) {
    return document.replace(
      /^(\w{2})(\w{3})(\w{3})(\w{4})(\d{2})$/,
      '$1.$2.$3/$4-$5',
    );
  }
  return document;
}
