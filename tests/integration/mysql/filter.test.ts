/**
 * MySQL — `where` filter coverage.
 *
 * The base mysql.test.ts already verifies equality and `gte`. This file covers
 * the remaining operator surface that Prisma exposes:
 *   - comparison: not, lt, lte, gt
 *   - membership: in, notIn
 *   - string:     contains, startsWith, endsWith
 *   - logical:    AND, OR, NOT compositions
 *
 * Each case captures the SELECT, interpolates it, and re-executes via
 * `$queryRawUnsafe` to confirm the logged SQL is both valid syntax for the
 * dialect and returns the same rows Prisma would.
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

/**
 * Pulls the SELECT statement that contains a WHERE clause out of a captured
 * batch. Prisma sometimes emits auxiliary SELECTs (e.g. inside transactions
 * for read-after-write); we want the user-facing query.
 */
function pickWhereSelect(events: QueryEvent[]): QueryEvent {
  const ev = events.find((e) => e.query.startsWith('SELECT') && e.query.includes('WHERE'));
  if (!ev) {
    throw new Error(
      `No SELECT...WHERE event captured. Got: ${events.map((e) => e.query).join('\n')}`,
    );
  }
  return ev;
}

async function seedCustomers(): Promise<void> {
  await prisma.customer.createMany({
    data: [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
      { name: 'Alex', email: 'alex@example.com' },
      { name: "O'Brien", email: 'obrien@example.com' },
    ],
  });
}

describe('MySQL filter — comparison operators', () => {
  it('not equals', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { not: 'Alice' } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const original = await prisma.customer.findMany({ where: { name: { not: 'Alice' } } });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed.length).toBe(original.length);
  });

  it('lt', async () => {
    await prisma.typeTest.createMany({
      data: [baseTypeTest({ num: 5 }), baseTypeTest({ num: 10 }), baseTypeTest({ num: 15 })],
    });
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({ where: { num: { lt: 10 } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(1);
  });

  it('lte', async () => {
    await prisma.typeTest.createMany({
      data: [baseTypeTest({ num: 5 }), baseTypeTest({ num: 10 }), baseTypeTest({ num: 15 })],
    });
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({ where: { num: { lte: 10 } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(2);
  });

  it('gt', async () => {
    await prisma.typeTest.createMany({
      data: [baseTypeTest({ num: 5 }), baseTypeTest({ num: 10 }), baseTypeTest({ num: 15 })],
    });
    const events = await captureQueries(() =>
      prisma.typeTest.findMany({ where: { num: { gt: 10 } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(1);
  });
});

describe('MySQL filter — membership operators', () => {
  it('in', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { in: ['Alice', 'Bob'] } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(2);
  });

  it('notIn', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { notIn: ['Alice', 'Bob'] } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    // 5 total - 2 excluded = 3 remaining
    expect(replayed).toHaveLength(3);
  });

  it('in with a single-quoted value (escape correctness)', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { in: ["O'Brien"] } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).toContain("'O''Brien'");

    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(1);
  });
});

describe('MySQL filter — string operators', () => {
  it('contains', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { contains: 'li' } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const original = await prisma.customer.findMany({ where: { name: { contains: 'li' } } });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed.length).toBe(original.length);
  });

  it('startsWith', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { startsWith: 'Al' } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    // "Alice" and "Alex"
    expect(replayed).toHaveLength(2);
  });

  it('endsWith', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { email: { endsWith: '@example.com' } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(5);
  });

  it('contains with a value that itself contains LIKE wildcards', async () => {
    // Prisma should escape the % and _ inside the parameter, not as part of
    // the LIKE pattern. We just need to confirm our SQL is still executable.
    await prisma.customer.create({
      data: { name: 'has%percent', email: 'percent@example.com' },
    });
    const events = await captureQueries(() =>
      prisma.customer.findMany({ where: { name: { contains: '%' } } }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const original = await prisma.customer.findMany({ where: { name: { contains: '%' } } });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed.length).toBe(original.length);
  });
});

describe('MySQL filter — logical compositions', () => {
  it('AND (implicit, via multiple top-level fields)', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({
        where: { name: { startsWith: 'A' }, email: { contains: 'alice' } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(1);
  });

  it('AND (explicit)', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({
        where: { AND: [{ name: { startsWith: 'A' } }, { email: { contains: 'lex' } }] },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(1);
    expect((replayed[0] as Record<string, unknown>)['name']).toBe('Alex');
  });

  it('OR', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({
        where: { OR: [{ name: 'Alice' }, { name: 'Bob' }] },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(2);
  });

  it('NOT', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({
        where: { NOT: { name: 'Alice' } },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const original = await prisma.customer.findMany({ where: { NOT: { name: 'Alice' } } });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed.length).toBe(original.length);
  });

  it('nested OR within AND', async () => {
    await seedCustomers();
    const events = await captureQueries(() =>
      prisma.customer.findMany({
        where: {
          AND: [
            { OR: [{ name: 'Alice' }, { name: 'Bob' }] },
            { email: { endsWith: '@example.com' } },
          ],
        },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(2);
  });
});

/**
 * Minimal valid TypeTest row with overridable fields, so the comparison-operator
 * tests can vary just the `num` column without restating the rest each time.
 */
function baseTypeTest(overrides: Partial<{ num: number; str: string }>) {
  return {
    str: overrides.str ?? 'x',
    text: 'body',
    num: overrides.num ?? 0,
    float: 1.0,
    big: 1n,
    bool: false,
    date: new Date('2026-01-01T00:00:00Z'),
    bytes: Buffer.alloc(0),
    json: {},
    optional: null,
  };
}
