/**
 * MySQL — JSON column queries.
 *
 * Prisma compiles JSON filters to `JSON_CONTAINS(JSON_EXTRACT(col, ?), ?)`.
 *
 * Known caveat (logged here, not a bug in this library):
 *   When MySQL receives JSON filter values via the binary prepared-statement
 *   protocol, the server auto-casts plain string params (e.g. "gold") into
 *   JSON. When we interpolate the same SQL into a plain text statement, the
 *   server gets a bare SQL string ('gold') and rejects it as invalid JSON
 *   text. A user copy-pasting the interpolated SQL into a MySQL client must
 *   wrap such values explicitly, e.g. `CAST('gold' AS JSON)` or '"gold"'.
 *
 * So for MySQL JSON queries we only verify the SQL is correctly interpolated
 * (no `?` left, JSON paths and values present). We do not re-execute via
 * `$queryRawUnsafe`, because that path would require the user-side casting
 * described above.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  attachCapture,
  cleanDatabase,
  createPrisma,
  toSql,
  type PrismaTestClient,
  type QueryEvent,
} from '../_helpers/index.js';

const DIALECT = 'mysql' as const;

let prisma: PrismaTestClient;
let captureQueries: ReturnType<typeof attachCapture>['captureQueries'];

beforeAll(() => {
  prisma = createPrisma();
  captureQueries = attachCapture(prisma).captureQueries;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await cleanDatabase(prisma);
});

function pickWhereSelect(events: QueryEvent[]): QueryEvent {
  const ev = events.find((e) => e.query.startsWith('SELECT') && e.query.includes('WHERE'));
  if (!ev) throw new Error('No SELECT...WHERE event captured.');
  return ev;
}

function baseRow(json: unknown) {
  return {
    str: 'x',
    text: 'body',
    num: 1,
    float: 1.0,
    big: 1n,
    bool: false,
    date: new Date('2026-01-01T00:00:00Z'),
    bytes: Buffer.alloc(0),
    json: json as object,
    optional: null,
  };
}

describe('MySQL — JSON filters (interpolation only)', () => {
  beforeEach(async () => {
    await prisma.typeTest.create({ data: baseRow({ tier: 'gold', score: 100 }) });
    await prisma.typeTest.create({ data: baseRow({ tier: 'silver', score: 50 }) });
  });

  it('path equals (string) interpolates path and value', async () => {
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({
        where: { json: { path: '$.tier', equals: 'gold' } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\?\s/);
    expect(sql).toContain("'$.tier'");
    expect(sql).toContain("'gold'");
    expect(sql.toUpperCase()).toContain('JSON_EXTRACT');
  });

  it('path equals (number) interpolates path and number value', async () => {
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({
        where: { json: { path: '$.score', equals: 100 } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\?\s/);
    expect(sql).toContain("'$.score'");
    expect(sql).toContain('100');
  });

  it('string_contains interpolates path and substring', async () => {
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({
        where: { json: { path: '$.tier', string_contains: 'ol' } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\?\s/);
    expect(sql).toContain("'$.tier'");
    // string_contains compiles to a LIKE pattern wrapped in %.
    expect(sql).toContain("'%ol%'");
  });
});
