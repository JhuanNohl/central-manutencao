/** Violação de unicidade do PostgreSQL, inclusive quando embrulhada pelo Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === '23505') return true;
  }
  return false;
}
