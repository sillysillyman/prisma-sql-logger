import { interpolate } from './interpolate.js';
import { parseParams } from './parse-params.js';
import type { CreatePrismaSqlLoggerOptions, QueryEvent } from './types.js';

/**
 * Create a Prisma query event handler that logs queries with parameters
 * inlined as runnable SQL.
 *
 * ⚠️ The output is intended for **logging and debugging only**. Never feed it
 * back into `$queryRaw` or any query execution path — doing so would reintroduce
 * SQL injection risk.
 *
 * @example
 * ```ts
 * const prisma = new PrismaClient({
 *   log: [{ emit: 'event', level: 'query' }],
 * });
 *
 * const log = createPrismaSqlLogger({ dialect: 'mysql' });
 * prisma.$on('query', log);
 * ```
 */
export function createPrismaSqlLogger(
  options: CreatePrismaSqlLoggerOptions,
): (event: QueryEvent) => void {
  const { dialect, logger, showDuration = false } = options;

  const defaultLogger = (sql: string, duration: number): void => {
    if (showDuration) {
      console.log(`(${duration}ms) ${sql}`);
    } else {
      console.log(sql);
    }
  };

  return (event: QueryEvent) => {
    const params = parseParams(event.params);
    const sql = interpolate(event.query, params, dialect);

    if (logger) {
      logger(sql, { timestamp: event.timestamp, duration: event.duration });
    } else {
      defaultLogger(sql, event.duration);
    }
  };
}
