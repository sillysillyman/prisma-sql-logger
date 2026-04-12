import type { Dialect } from '../types.js';
import { quoteString, toHex } from '../utils.js';
import { tokenizeAndReplace } from '../tokenizer.js';

export const mysql: Dialect = {
  interpolate(query, params) {
    let paramIndex = 0;
    const result = tokenizeAndReplace(query, () => {
      if (paramIndex >= params.length) {
        throw new Error(
          `prisma-sql-logger: more ? placeholders than params (params length: ${params.length})`,
        );
      }
      return this.formatValue(params[paramIndex++]);
    });
    return result;
  },

  formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return 'NULL';
      }
      return String(value);
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'string') {
      return quoteString(value);
    }

    if (value instanceof Date) {
      return quoteString(value.toISOString());
    }

    if (value instanceof Uint8Array) {
      return `X'${toHex(value)}'`;
    }

    if (typeof value === 'object') {
      return quoteString(JSON.stringify(value));
    }

    return quoteString(String(value));
  },
};
