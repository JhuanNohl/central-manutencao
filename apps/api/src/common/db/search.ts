/**
 * Padrão `ILIKE` de "contém", com `%`, `_` e `\` do termo escapados para
 * que sejam buscados literalmente. Termo vazio ou ausente não filtra.
 */
export function containsPattern(term: string | undefined): string | undefined {
  if (!term) return undefined;
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
