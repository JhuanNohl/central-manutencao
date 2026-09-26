/** Referência `{ id, name }` vinda de um LEFT JOIN, ou `null` se ausente. */
export function reference(
  id: string | null,
  name: string | null,
): { id: string; name: string } | null {
  return id !== null && name !== null ? { id, name } : null;
}
