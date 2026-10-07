/**
 * Nota interna gravada no cancelamento (decisão de 07/10/2026): com
 * equipamentos na fábrica, o chamado entra em processo de devolução e a nota
 * lista o que volta ao cliente.
 */
export function cancellationNote(reason: string, toReturn: string[]): string {
  if (toReturn.length === 0) {
    return [
      'Chamado cancelado antes da chegada dos equipamentos à fábrica: não há devolução.',
      `Motivo: ${reason}`,
    ].join('\n');
  }
  return [
    'Em processo de devolução: chamado cancelado com equipamentos na fábrica.',
    `Motivo: ${reason}`,
    'A devolver ao cliente:',
    ...toReturn.map((line) => `- ${line}`),
  ].join('\n');
}
