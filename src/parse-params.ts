/**
 * Parse Prisma's `e.params` string into an array of values.
 *
 * Handles three quirks of Prisma's serialization:
 * 1. `<N bytes blob>` tokens — not valid JSON, replaced with placeholder strings.
 * 2. Raw control characters (newlines, tabs) inside string values — escaped before JSON.parse.
 * 3. Large integers beyond Number.MAX_SAFE_INTEGER — converted to BigInt to avoid precision loss.
 */
export function parseParams(paramsStr: string): unknown[] {
  let s = paramsStr;

  // 1. Replace <N bytes blob> with a JSON-safe placeholder string
  s = s.replace(/<(\d+) bytes blob>/g, '"<$1 bytes blob>"');

  // 2. Escape raw control characters that would break JSON.parse
  //    Only escape those inside string values (between unescaped quotes).
  s = escapeControlChars(s);

  // 3. Protect large integers from precision loss.
  //    Match bare integer literals (not inside quotes, not floats) that exceed MAX_SAFE_INTEGER
  //    and wrap them in quotes with a __bigint: marker so we can convert them back after JSON.parse.
  const BIGINT_MARKER = '__bigint:';
  s = s.replace(
    /(?<=[[\s,:])-?(\d{16,})(?=[,\]\s}])/g,
    (match) => {
      const n = BigInt(match);
      if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(-Number.MAX_SAFE_INTEGER)) {
        return `"${BIGINT_MARKER}${match}"`;
      }
      return match;
    },
  );

  const parsed = JSON.parse(s) as unknown[];

  // 4. Convert marked strings back to BigInt
  return parsed.map(function revive(v: unknown): unknown {
    if (typeof v === 'string' && v.startsWith(BIGINT_MARKER)) {
      return BigInt(v.slice(BIGINT_MARKER.length));
    }
    return v;
  });
}

/**
 * Escape raw control characters (\n, \r, \t) that appear inside JSON string values.
 * JSON spec requires these to be escaped, but Prisma's params string may contain them raw.
 */
function escapeControlChars(s: string): string {
  const len = s.length;
  let result = '';
  let inString = false;
  let i = 0;

  while (i < len) {
    const ch = s[i]!;

    if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      result += ch;
      i++;
      continue;
    }

    if (inString) {
      if (ch === '\n') {
        result += '\\n';
        i++;
        continue;
      }
      if (ch === '\r') {
        result += '\\r';
        i++;
        continue;
      }
      if (ch === '\t') {
        result += '\\t';
        i++;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}
