/**
 * Interpolate parameter placeholders in a SQL query with their literal values,
 * producing a runnable SQL string.
 *
 * Delegates to a dialect-specific implementation based on the `dialect` argument.
 *
 * ⚠️ The output is intended for **logging and debugging only**. Never feed it
 * back into `$queryRaw` or any query execution path — that would reintroduce
 * SQL injection risk.
 */

import type { Dialect } from './dialects/types.js';
import { mysql } from './dialects/mysql/index.js';
import { postgresql } from './dialects/postgresql/index.js';

export type DialectName = 'mysql' | 'postgresql';

const dialects: Record<DialectName, Dialect> = {
  mysql,
  postgresql,
};

export function interpolate(
  query: string,
  params: readonly unknown[],
  dialect: DialectName,
): string {
  return dialects[dialect].interpolate(query, params);
}
