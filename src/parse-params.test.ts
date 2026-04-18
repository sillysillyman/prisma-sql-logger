import { describe, it, expect } from 'vitest';
import { parseParams } from './parse-params.js';

describe('parseParams', () => {
  describe('basic types', () => {
    it('parses empty array', () => {
      expect(parseParams('[]')).toEqual([]);
    });

    it('parses null', () => {
      expect(parseParams('[null]')).toEqual([null]);
    });

    it('parses integers', () => {
      expect(parseParams('[1,42,0,-7]')).toEqual([1, 42, 0, -7]);
    });

    it('parses floats', () => {
      expect(parseParams('[3.14,-0.5]')).toEqual([3.14, -0.5]);
    });

    it('parses booleans', () => {
      expect(parseParams('[true,false]')).toEqual([true, false]);
    });

    it('parses strings', () => {
      expect(parseParams('["hello","world"]')).toEqual(['hello', 'world']);
    });

    it('parses strings with escaped quotes', () => {
      expect(parseParams(`["O'Brien"]`)).toEqual(["O'Brien"]);
    });

    it('parses objects (JSON)', () => {
      expect(parseParams('[{"key":"value"}]')).toEqual([{ key: 'value' }]);
    });
  });

  describe('bigint preservation', () => {
    it('converts integers beyond Number.MAX_SAFE_INTEGER to BigInt', () => {
      const result = parseParams('[9007199254740993]');
      expect(result).toEqual([9007199254740993n]);
    });

    it('converts negative large integers to BigInt', () => {
      const result = parseParams('[-9007199254740993]');
      expect(result).toEqual([-9007199254740993n]);
    });

    it('does not touch safe integers', () => {
      const result = parseParams('[9007199254740991]');
      expect(result).toEqual([9007199254740991]);
    });

    it('does not touch floats that look large', () => {
      // 9007199254740993.5 is a float, not an integer — JSON.parse handles it fine
      const result = parseParams('[9007199254740993.5]');
      expect(typeof result[0]).toBe('number');
    });
  });

  describe('blob handling', () => {
    it('converts <N bytes blob> to placeholder string', () => {
      expect(parseParams('[1,<4 bytes blob>,2]')).toEqual([1, '<4 bytes blob>', 2]);
    });

    it('handles <0 bytes blob>', () => {
      expect(parseParams('[<0 bytes blob>]')).toEqual(['<0 bytes blob>']);
    });

    it('handles multiple blobs', () => {
      expect(parseParams('[<4 bytes blob>,<10 bytes blob>]')).toEqual([
        '<4 bytes blob>',
        '<10 bytes blob>',
      ]);
    });
  });

  describe('control characters', () => {
    it('handles raw newlines in string values', () => {
      const input = '[\"hello\nworld\"]';
      const result = parseParams(input);
      expect(result).toEqual(['hello\nworld']);
    });

    it('handles raw tabs in string values', () => {
      const input = '[\"hello\tworld\"]';
      const result = parseParams(input);
      expect(result).toEqual(['hello\tworld']);
    });

    it('handles raw carriage returns', () => {
      const input = '[\"hello\rworld\"]';
      const result = parseParams(input);
      expect(result).toEqual(['hello\rworld']);
    });
  });

  describe('mixed types (real Prisma output)', () => {
    it('parses a realistic INSERT params string', () => {
      const input =
        '[null,"O\'Brien","Hello world",42,3.14,9007199254740993,true,"2026-04-08 12:34:56.789 UTC",<4 bytes blob>,{"key":"value"},null]';
      const result = parseParams(input);
      expect(result).toEqual([
        null,
        "O'Brien",
        'Hello world',
        42,
        3.14,
        9007199254740993n, // preserved as BigInt
        true,
        '2026-04-08 12:34:56.789 UTC',
        '<4 bytes blob>',
        { key: 'value' },
        null,
      ]);
    });
  });
});
