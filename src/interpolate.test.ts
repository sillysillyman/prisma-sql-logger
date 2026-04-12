import { describe, it, expect } from 'vitest';
import { interpolate } from './interpolate.js';

describe('interpolate (entry point)', () => {
  it('delegates to postgresql dialect', () => {
    expect(interpolate('SELECT $1', [42], 'postgresql')).toBe('SELECT 42');
  });

  it('delegates to mysql dialect', () => {
    expect(interpolate('SELECT ?', [42], 'mysql')).toBe('SELECT 42');
  });
});
