import type { Dialect } from '../types.js';
import { quoteString, toHex } from '../utils.js';

export const postgresql: Dialect = {
  interpolate(query, params) {
    return query.replace(/\$(\d+)/g, (_match, indexStr: string) => {
      const index = Number(indexStr);
      if (index < 1 || index > params.length) {
        throw new Error(
          `prisma-sql-logger: placeholder $${index} is out of range (params length: ${params.length})`,
        );
      }
      return this.formatValue(params[index - 1]);
    });
  },

  formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
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
      return `'\\x${toHex(value)}'`;
    }

    if (Array.isArray(value)) {
      return `ARRAY[${value.map((v) => this.formatValue(v)).join(', ')}]`;
    }

    if (typeof value === 'object') {
      return `${quoteString(JSON.stringify(value))}::jsonb`;
    }

    return quoteString(String(value));
  },
};
