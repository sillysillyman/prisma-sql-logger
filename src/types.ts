import type { DialectName } from './interpolate.js';

/**
 * Payload emitted by Prisma's `query` event.
 * See: https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/logging
 */
export interface QueryEvent {
  query: string;
  /** JSON-encoded array of parameter values (not a parsed array). */
  params: string;
  /** Query execution time in milliseconds. */
  duration: number;
  timestamp?: string;
  target?: string;
}

/**
 * Metadata passed to a custom logger alongside the interpolated SQL.
 */
export interface LogMeta {
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
