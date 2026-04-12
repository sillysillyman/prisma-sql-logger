import { describe, it, expect } from 'vitest';
import { postgresql } from './index.js';

describe('postgresql dialect', () => {
  const interpolate = (query: string, params: unknown[]) => postgresql.interpolate(query, params);

  describe('basic substitution', () => {
    it('replaces a single $1 placeholder', () => {
      expect(interpolate('SELECT * FROM "User" WHERE id = $1', [42])).toBe(
        'SELECT * FROM "User" WHERE id = 42',
      );
    });

    it('replaces multiple placeholders in order', () => {
      expect(
        interpolate('SELECT * FROM "User" WHERE id = $1 LIMIT $2 OFFSET $3', [42, 10, 0]),
      ).toBe('SELECT * FROM "User" WHERE id = 42 LIMIT 10 OFFSET 0');
    });

    it('handles repeated placeholders', () => {
      expect(interpolate('SELECT $1, $1, $2', [1, 2])).toBe('SELECT 1, 1, 2');
    });

    it('handles placeholders with double-digit indices', () => {
      const params = Array.from({ length: 12 }, (_, i) => i + 1);
      expect(interpolate('VALUES ($1, $2, $10, $11, $12)', params)).toBe(
        'VALUES (1, 2, 10, 11, 12)',
      );
    });

    it('returns query unchanged when params is empty and no placeholders', () => {
      expect(interpolate('SELECT 1', [])).toBe('SELECT 1');
    });
  });

  describe('null and undefined', () => {
    it('renders null as NULL', () => {
      expect(interpolate('SELECT $1', [null])).toBe('SELECT NULL');
    });

    it('renders undefined as NULL', () => {
      expect(interpolate('SELECT $1', [undefined])).toBe('SELECT NULL');
    });
  });

  describe('numbers', () => {
    it('renders integers', () => {
      expect(interpolate('SELECT $1', [42])).toBe('SELECT 42');
    });

    it('renders negative integers', () => {
      expect(interpolate('SELECT $1', [-7])).toBe('SELECT -7');
    });

    it('renders floats', () => {
      expect(interpolate('SELECT $1', [3.14])).toBe('SELECT 3.14');
    });

    it('renders zero', () => {
      expect(interpolate('SELECT $1', [0])).toBe('SELECT 0');
    });

    it('renders NaN as NULL (not a valid SQL number)', () => {
      expect(interpolate('SELECT $1', [NaN])).toBe('SELECT NULL');
    });

    it('renders Infinity as NULL', () => {
      expect(interpolate('SELECT $1', [Infinity])).toBe('SELECT NULL');
    });
  });

  describe('bigint', () => {
    it('renders bigint without the n suffix', () => {
      expect(interpolate('SELECT $1', [9007199254740993n])).toBe('SELECT 9007199254740993');
    });

    it('renders negative bigint', () => {
      expect(interpolate('SELECT $1', [-123n])).toBe('SELECT -123');
    });
  });

  describe('booleans', () => {
    it('renders true', () => {
      expect(interpolate('SELECT $1', [true])).toBe('SELECT TRUE');
    });

    it('renders false', () => {
      expect(interpolate('SELECT $1', [false])).toBe('SELECT FALSE');
    });
  });

  describe('strings', () => {
    it('wraps simple strings in single quotes', () => {
      expect(interpolate('SELECT $1', ['hello'])).toBe("SELECT 'hello'");
    });

    it('escapes single quotes by doubling them', () => {
      expect(interpolate('SELECT $1', ["O'Brien"])).toBe("SELECT 'O''Brien'");
    });

    it('handles strings with double quotes unchanged', () => {
      expect(interpolate('SELECT $1', ['say "hi"'])).toBe(`SELECT 'say "hi"'`);
    });

    it('handles empty strings', () => {
      expect(interpolate('SELECT $1', [''])).toBe("SELECT ''");
    });

    it('handles backslashes (PostgreSQL standard_conforming_strings = on)', () => {
      expect(interpolate('SELECT $1', ['a\\b'])).toBe("SELECT 'a\\b'");
    });

    it('handles strings containing $N tokens without re-substituting', () => {
      expect(interpolate('SELECT $1, $2', ['$2', 'safe'])).toBe("SELECT '$2', 'safe'");
    });
  });

  describe('Date', () => {
    it('renders Date as ISO 8601 timestamp literal', () => {
      const d = new Date('2026-04-08T12:34:56.789Z');
      expect(interpolate('SELECT $1', [d])).toBe("SELECT '2026-04-08T12:34:56.789Z'");
    });
  });

  describe('Buffer / Uint8Array', () => {
    it('renders Buffer as bytea hex literal', () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      expect(interpolate('SELECT $1', [buf])).toBe("SELECT '\\xdeadbeef'");
    });

    it('renders empty Buffer', () => {
      expect(interpolate('SELECT $1', [Buffer.alloc(0)])).toBe("SELECT '\\x'");
    });

    it('renders Uint8Array as bytea hex literal', () => {
      expect(interpolate('SELECT $1', [new Uint8Array([0x01, 0x02, 0xff])])).toBe(
        "SELECT '\\x0102ff'",
      );
    });
  });

  describe('arrays', () => {
    it('renders number array as ARRAY[...]', () => {
      expect(interpolate('SELECT $1', [[1, 2, 3]])).toBe('SELECT ARRAY[1, 2, 3]');
    });

    it('renders string array as ARRAY[...] with quoted elements', () => {
      expect(interpolate('SELECT $1', [['a', 'b']])).toBe("SELECT ARRAY['a', 'b']");
    });

    it('renders empty array', () => {
      expect(interpolate('SELECT $1', [[]])).toBe('SELECT ARRAY[]');
    });

    it('escapes quotes in array string elements', () => {
      expect(interpolate('SELECT $1', [["O'Brien"]])).toBe("SELECT ARRAY['O''Brien']");
    });

    it('renders array with nulls', () => {
      expect(interpolate('SELECT $1', [[1, null, 3]])).toBe('SELECT ARRAY[1, NULL, 3]');
    });
  });

  describe('JSON / objects', () => {
    it('renders plain object as jsonb literal', () => {
      expect(interpolate('SELECT $1', [{ a: 1, b: 'x' }])).toBe(`SELECT '{"a":1,"b":"x"}'::jsonb`);
    });

    it('escapes single quotes inside JSON', () => {
      expect(interpolate('SELECT $1', [{ name: "O'Brien" }])).toBe(
        `SELECT '{"name":"O''Brien"}'::jsonb`,
      );
    });
  });

  describe('error cases', () => {
    it('throws when a referenced placeholder index is out of range', () => {
      expect(() => interpolate('SELECT $1, $2', [1])).toThrow();
    });
  });
});
