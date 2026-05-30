import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPrismaSqlLogger } from './create-logger.js';
import type { QueryEvent } from './types.js';

function makeEvent(overrides: Partial<QueryEvent> = {}): QueryEvent {
  return {
    query: 'SELECT 1',
    params: '[]',
    duration: 1,
    ...overrides,
  };
}

describe('createPrismaSqlLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('factory', () => {
    it('returns a function', () => {
      const log = createPrismaSqlLogger({ dialect: 'mysql' });
      expect(typeof log).toBe('function');
    });
  });

  describe('dialect dispatch', () => {
    it('interpolates MySQL ? placeholders', () => {
      const calls: string[] = [];
      const log = createPrismaSqlLogger({
        dialect: 'mysql',
        logger: (sql) => calls.push(sql),
      });

      log(makeEvent({ query: 'SELECT * FROM `User` WHERE id = ?', params: '[42]' }));

      expect(calls).toEqual(['SELECT * FROM `User` WHERE id = 42']);
    });

    it('interpolates PostgreSQL $1 placeholders', () => {
      const calls: string[] = [];
      const log = createPrismaSqlLogger({
        dialect: 'postgresql',
        logger: (sql) => calls.push(sql),
      });

      log(makeEvent({ query: 'SELECT * FROM "User" WHERE id = $1', params: '[42]' }));

      expect(calls).toEqual(['SELECT * FROM "User" WHERE id = 42']);
    });
  });

  describe('params parsing', () => {
    it('applies parseParams (blob token)', () => {
      const calls: string[] = [];
      const log = createPrismaSqlLogger({
        dialect: 'mysql',
        logger: (sql) => calls.push(sql),
      });

      log(
        makeEvent({
          query: 'INSERT INTO `t` (`bytes`) VALUES (?)',
          params: '[<4 bytes blob>]',
        }),
      );

      expect(calls[0]).toContain("'<4 bytes blob>'");
    });

    it('preserves BigInt precision', () => {
      const calls: string[] = [];
      const log = createPrismaSqlLogger({
        dialect: 'mysql',
        logger: (sql) => calls.push(sql),
      });

      log(
        makeEvent({
          query: 'SELECT ?',
          params: '[9007199254740993]',
        }),
      );

      expect(calls[0]).toBe('SELECT 9007199254740993');
    });

    it('handles strings with special characters', () => {
      const calls: string[] = [];
      const log = createPrismaSqlLogger({
        dialect: 'mysql',
        logger: (sql) => calls.push(sql),
      });

      log(
        makeEvent({
          query: 'SELECT * FROM `t` WHERE name = ?',
          params: `["O'Brien"]`,
        }),
      );

      expect(calls[0]).toBe("SELECT * FROM `t` WHERE name = 'O''Brien'");
    });
  });

  describe('default logger', () => {
    it('uses console.log when no logger provided', () => {
      const spy = vi.spyOn(console, 'log');
      const log = createPrismaSqlLogger({ dialect: 'mysql' });

      log(makeEvent({ query: 'SELECT ?', params: '[1]' }));

      expect(spy).toHaveBeenCalledWith('SELECT 1');
    });

    it('prepends duration when showDuration is true', () => {
      const spy = vi.spyOn(console, 'log');
      const log = createPrismaSqlLogger({ dialect: 'mysql', showDuration: true });

      log(makeEvent({ query: 'SELECT ?', params: '[1]', duration: 7 }));

      expect(spy).toHaveBeenCalledWith('(7ms) SELECT 1');
    });

    it('does not prepend duration when showDuration is false', () => {
      const spy = vi.spyOn(console, 'log');
      const log = createPrismaSqlLogger({ dialect: 'mysql', showDuration: false });

      log(makeEvent({ query: 'SELECT ?', params: '[1]', duration: 7 }));

      expect(spy).toHaveBeenCalledWith('SELECT 1');
    });

    it('does not prepend duration by default', () => {
      const spy = vi.spyOn(console, 'log');
      const log = createPrismaSqlLogger({ dialect: 'mysql' });

      log(makeEvent({ query: 'SELECT ?', params: '[1]', duration: 7 }));

      expect(spy).toHaveBeenCalledWith('SELECT 1');
    });
  });

  describe('custom logger', () => {
    it('receives interpolated SQL and meta with duration', () => {
      const logger = vi.fn();
      const log = createPrismaSqlLogger({ dialect: 'mysql', logger });

      log(makeEvent({ query: 'SELECT ?', params: '[42]', duration: 5 }));

      expect(logger).toHaveBeenCalledWith('SELECT 42', { duration: 5 });
    });

    it('is called once per event', () => {
      const logger = vi.fn();
      const log = createPrismaSqlLogger({ dialect: 'mysql', logger });

      log(makeEvent({ query: 'SELECT ?', params: '[1]' }));
      log(makeEvent({ query: 'SELECT ?', params: '[2]' }));

      expect(logger).toHaveBeenCalledTimes(2);
    });

    it('ignores showDuration (user controls formatting)', () => {
      const logger = vi.fn();
      const log = createPrismaSqlLogger({
        dialect: 'mysql',
        logger,
        showDuration: true,
      });

      log(makeEvent({ query: 'SELECT ?', params: '[1]', duration: 10 }));

      // SQL should not contain the duration prefix
      expect(logger).toHaveBeenCalledWith('SELECT 1', { duration: 10 });
    });
  });

  describe('transaction control statements', () => {
    it('passes BEGIN through unchanged (not filtered)', () => {
      const logger = vi.fn();
      const log = createPrismaSqlLogger({ dialect: 'mysql', logger });

      log(makeEvent({ query: 'BEGIN', params: '[]' }));

      expect(logger).toHaveBeenCalledWith('BEGIN', { duration: 1 });
    });

    it('passes COMMIT through', () => {
      const logger = vi.fn();
      const log = createPrismaSqlLogger({ dialect: 'mysql', logger });

      log(makeEvent({ query: 'COMMIT', params: '[]' }));

      expect(logger).toHaveBeenCalledWith('COMMIT', { duration: 1 });
    });
  });
});
