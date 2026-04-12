/**
 * A Dialect knows how to:
 * 1. Find placeholders in a query string and replace them with formatted values.
 * 2. Format individual JS/TS values into SQL literals for that database.
 */
export interface Dialect {
  /**
   * Replace parameter placeholders in `query` with literal values from `params`.
   */
  interpolate(query: string, params: readonly unknown[]): string;

  /**
   * Convert a single JS/TS value into a SQL literal string for this dialect.
   */
  formatValue(value: unknown): string;
}
