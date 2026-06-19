/**
 * PostgreSQL — JSONB column queries.
 *
 * Same caveat as MySQL: PG receives JSON-filter values via the binary
 * prepared-statement protocol, which lets the server auto-cast strings and
 * numbers into jsonb. When we re-execute the interpolated SQL as a plain
 * text statement, PG instead reports errors like
 *   "operator does not exist: jsonb = integer"
 *   "invalid input syntax for type json: Token \"gold\" is invalid"
 *
 * A user copy-pasting the logged SQL must add casts such as
 *   `"json"->>'tier' = 'gold'::text` or `('100')::jsonb`.
 * For now we only verify the SQL is correctly interpolated (no `$N` left,
 * path and value present); execution is left to the user's manual cast.
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

const DIALECT = 'postgresql' as const;

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

describe('PostgreSQL — JSON filters', () => {
  beforeEach(async () => {
    await prisma.typeTest.create({ data: baseRow({ tier: 'gold', score: 100 }) });
    await prisma.typeTest.create({ data: baseRow({ tier: 'silver', score: 50 }) });
    await prisma.typeTest.create({ data: baseRow({ tier: 'bronze', score: 10 }) });
  });

  it('path equals (string) interpolates path and value', async () => {
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({
        where: { json: { path: ['tier'], equals: 'gold' } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);
    expect(sql).toContain("'gold'");
  });

  it('path equals (number) interpolates path and number value', async () => {
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({
        where: { json: { path: ['score'], equals: 100 } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);
    expect(sql).toContain('100');
  });

  it('string_contains interpolates path and substring (compiles to LIKE pattern)', async () => {
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({
        where: { json: { path: ['tier'], string_contains: 'ol' } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);
    expect(sql).toContain("'%ol%'");
  });
});
