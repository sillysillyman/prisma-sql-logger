/**
 * Shared formatting utilities used across dialects.
 */

/**
 * Quote a string using single-quote doubling: O'Brien → 'O''Brien'
 * Works for PostgreSQL, MySQL (with NO_BACKSLASH_ESCAPES), SQLite.
 */
export function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Format a byte sequence as a hex literal.
 * PostgreSQL: '\\xDEADBEEF'
 * MySQL/SQLite: X'DEADBEEF'
 */
export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
