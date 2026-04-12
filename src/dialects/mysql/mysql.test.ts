import { describe, it, expect } from 'vitest';
import { mysql } from './index.js';

describe('mysql dialect', () => {
  const interpolate = (query: string, params: unknown[]) => mysql.interpolate(query, params);

  describe('basic substitution', () => {
    it('replaces a single ? placeholder', () => {
      expect(interpolate('SELECT * FROM `User` WHERE id = ?', [42])).toBe(
        'SELECT * FROM `User` WHERE id = 42',
      );
    });

    it('replaces multiple ? placeholders in order', () => {
      expect(interpolate('SELECT * FROM `User` WHERE id = ? LIMIT ? OFFSET ?', [42, 10, 0])).toBe(
        'SELECT * FROM `User` WHERE id = 42 LIMIT 10 OFFSET 0',
      );
    });

    it('returns query unchanged when params is empty and no placeholders', () => {
      expect(interpolate('SELECT 1', [])).toBe('SELECT 1');
    });
  });

  describe('? inside string literals must be skipped', () => {
    it('skips ? inside single-quoted strings', () => {
      expect(interpolate("SELECT * FROM t WHERE name = 'who?' AND id = ?", [42])).toBe(
        "SELECT * FROM t WHERE name = 'who?' AND id = 42",
      );
    });

    it('handles escaped quotes inside strings', () => {
      expect(interpolate("SELECT * FROM t WHERE name = 'it''s?' AND id = ?", [1])).toBe(
        "SELECT * FROM t WHERE name = 'it''s?' AND id = 1",
      );
    });

    it('skips ? inside double-quoted identifiers', () => {
      expect(interpolate('SELECT * FROM "col?" WHERE id = ?', [5])).toBe(
        'SELECT * FROM "col?" WHERE id = 5',
      );
    });

    it('skips ? inside backtick-quoted identifiers', () => {
      expect(interpolate('SELECT * FROM `col?` WHERE id = ?', [5])).toBe(
        'SELECT * FROM `col?` WHERE id = 5',
      );
    });
  });

  describe('? inside comments must be skipped', () => {
    it('skips ? inside line comments', () => {
      expect(interpolate('SELECT ? -- is this a param?\nFROM t', [1])).toBe(
        'SELECT 1 -- is this a param?\nFROM t',
      );
    });

    it('skips ? inside block comments', () => {
      expect(interpolate('SELECT ? /* what? */ FROM t', [1])).toBe('SELECT 1 /* what? */ FROM t');
    });
  });

  describe('null and undefined', () => {
    it('renders null as NULL', () => {
      expect(interpolate('SELECT ?', [null])).toBe('SELECT NULL');
    });

    it('renders undefined as NULL', () => {
      expect(interpolate('SELECT ?', [undefined])).toBe('SELECT NULL');
    });
  });

  describe('numbers', () => {
    it('renders integers', () => {
      expect(interpolate('SELECT ?', [42])).toBe('SELECT 42');
    });

    it('renders negative integers', () => {
      expect(interpolate('SELECT ?', [-7])).toBe('SELECT -7');
    });

    it('renders floats', () => {
      expect(interpolate('SELECT ?', [3.14])).toBe('SELECT 3.14');
    });

    it('renders NaN as NULL', () => {
      expect(interpolate('SELECT ?', [NaN])).toBe('SELECT NULL');
    });

    it('renders Infinity as NULL', () => {
      expect(interpolate('SELECT ?', [Infinity])).toBe('SELECT NULL');
    });
  });

  describe('bigint', () => {
    it('renders bigint', () => {
      expect(interpolate('SELECT ?', [9007199254740993n])).toBe('SELECT 9007199254740993');
    });
  });

  describe('booleans', () => {
    it('renders true as 1', () => {
      expect(interpolate('SELECT ?', [true])).toBe('SELECT 1');
    });

    it('renders false as 0', () => {
      expect(interpolate('SELECT ?', [false])).toBe('SELECT 0');
    });
  });

  describe('strings', () => {
    it('wraps strings in single quotes', () => {
      expect(interpolate('SELECT ?', ['hello'])).toBe("SELECT 'hello'");
    });

    it('escapes single quotes by doubling', () => {
      expect(interpolate('SELECT ?', ["O'Brien"])).toBe("SELECT 'O''Brien'");
    });

    it('handles empty strings', () => {
      expect(interpolate('SELECT ?', [''])).toBe("SELECT ''");
    });
  });

  describe('Date', () => {
    it('renders Date as quoted ISO 8601 string', () => {
      const d = new Date('2026-04-08T12:34:56.789Z');
      expect(interpolate('SELECT ?', [d])).toBe("SELECT '2026-04-08T12:34:56.789Z'");
    });
  });

  describe('Buffer / Uint8Array', () => {
    it('renders Buffer as X hex literal', () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      expect(interpolate('SELECT ?', [buf])).toBe("SELECT X'deadbeef'");
    });

    it('renders empty Buffer', () => {
      expect(interpolate('SELECT ?', [Buffer.alloc(0)])).toBe("SELECT X''");
    });
  });

  describe('JSON / objects', () => {
    it('renders plain object as JSON string', () => {
      expect(interpolate('SELECT ?', [{ a: 1, b: 'x' }])).toBe(`SELECT '{"a":1,"b":"x"}'`);
    });

    it('escapes single quotes inside JSON', () => {
      expect(interpolate('SELECT ?', [{ name: "O'Brien" }])).toBe(`SELECT '{"name":"O''Brien"}'`);
    });
  });

  describe('error cases', () => {
    it('throws when more ? placeholders than params', () => {
      expect(() => interpolate('SELECT ?, ?', [1])).toThrow();
    });
  });
});
