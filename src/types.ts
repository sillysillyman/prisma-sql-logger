import type { DialectName } from './interpolate.js';

/**
 * Subset of Prisma's `query` event payload that this library consumes.
 *
 * Only the fields we actually use are declared, so the handler we return
 * is structurally assignable to Prisma's `$on('query', ...)` signature
 * without requiring `as any` at the call site.
 *
 * See: https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging
 */
export interface QueryEvent {
  /** When the query was emitted by Prisma. */
  timestamp: Date;
  query: string;
  /** JSON-encoded array of parameter values (not a parsed array). */
  params: string;
  /** Query execution time in milliseconds. */
  duration: number;
}

/**
 * Metadata passed to a custom logger alongside the interpolated SQL.
 */
export interface LogMeta {
  /** When the query was emitted by Prisma (useful for log correlation). */
  timestamp: Date;
  /** Query execution time in milliseconds. */
  duration: number;
}

/**
 * A logger function that receives the interpolated SQL and associated metadata.
 */
export type Logger = (sql: string, meta: LogMeta) => void;

export interface CreatePrismaSqlLoggerOptions {
  /** Database dialect — determines placeholder syntax and value formatting. */
  dialect: DialectName;

  /**
   * Custom logger function. Receives the interpolated SQL and metadata.
   * If not provided, logs to `console.log` (formatting controlled by `showDuration`).
   */
  logger?: Logger;

  /**
   * When using the default `console.log` logger, prepend query duration
   * like `(3ms) SELECT ...`. Ignored if a custom `logger` is provided.
   * Default: `false`.
   */
  showDuration?: boolean;
}
