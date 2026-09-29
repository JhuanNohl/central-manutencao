const DAY_MS = 86_400_000;

/**
 * Saldo por extenso: dias restantes arredondados para cima (recém-recebido
 * mostra "faltam 30 dias"); atraso em dias completos.
 */
export function slaRemainingLabel(dueAt: string, now = Date.now()): string {
  const ms = new Date(dueAt).getTime() - now;
  if (ms > 0) {
    const days = Math.ceil(ms / DAY_MS);
    return days === 1 ? 'vence em menos de 1 dia' : `faltam ${days} dias`;
  }
  const late = Math.floor(-ms / DAY_MS);
  if (late === 0) return 'atrasado há menos de 1 dia';
  return late === 1 ? 'atrasado há 1 dia' : `atrasado há ${late} dias`;
}
