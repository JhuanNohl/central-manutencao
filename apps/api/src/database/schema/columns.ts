import { sql, type SQL } from 'drizzle-orm';
import { timestamp, type PgColumn } from 'drizzle-orm/pg-core';

/** Instante com fuso (persistido em UTC). */
export const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => instant('created_at').defaultNow().notNull();
export const updatedAt = () =>
  instant('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

/** Restrição `coluna IN (...)` para colunas texto com domínio fechado. */
export function oneOf(column: PgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.join(
    values.map((value) => sql.raw(`'${value.replace(/'/g, "''")}'`)),
    sql`, `,
  )})`;
}
