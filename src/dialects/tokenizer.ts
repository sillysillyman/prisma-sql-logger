/**
 * SQL tokenizer for `?` placeholder dialects (MySQL, SQLite).
 *
 * Walks through a SQL string character by character, skipping over:
 * - Single-quoted strings ('...' with '' as escape)
 * - Double-quoted identifiers ("...")
 * - Backtick-quoted identifiers (`...`)
 * - Line comments (-- ...)
 * - Block comments (/​* ... *​/)
 *
 * When a bare `?` is found outside all of the above, calls `replacer()`
 * and splices in the returned string.
 */
export function tokenizeAndReplace(sql: string, replacer: () => string): string {
  const len = sql.length;
  let out = '';
  let i = 0;

  while (i < len) {
    const ch = sql[i]!;

    // Single-quoted string literal
    if (ch === "'") {
      const end = skipQuoted(sql, i, "'");
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // Double-quoted identifier
    if (ch === '"') {
      const end = skipQuoted(sql, i, '"');
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // Backtick-quoted identifier
    if (ch === '`') {
      const end = skipQuoted(sql, i, '`');
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // Line comment: -- until end of line
    if (ch === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i);
      const end = newline === -1 ? len : newline + 1;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // Block comment: /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? len : close + 2;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // Bare ? placeholder
    if (ch === '?') {
      out += replacer();
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Starting at position `start` (which is the opening quote character),
 * skip to just past the closing quote. Handles doubled-quote escapes
 * (e.g. '' inside a single-quoted string).
 */
function skipQuoted(sql: string, start: number, quote: string): number {
  const len = sql.length;
  let i = start + 1; // skip opening quote
  while (i < len) {
    if (sql[i] === quote) {
      // Doubled quote → escape, skip both
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      // Closing quote
      return i + 1;
    }
    i++;
  }
  // Unterminated quote — return rest of string
  return len;
}
