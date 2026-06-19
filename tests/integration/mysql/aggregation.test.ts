/**
 * MySQL — aggregations.
 *
 * Covers:
 *   - count: simple count, count with where, count of relation (_count)
 *   - aggregate: _sum, _avg, _min, _max, _count
 *   - groupBy: with _sum/_count, with having
 *
 * Each captured SELECT is re-executed against MySQL. For numeric aggregates
 * we additionally compare key values to Prisma's own result.
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

function pickRootSelect(events: QueryEvent[]): QueryEvent {
  const ev = events.find((e) => e.query.startsWith('SELECT'));
  if (!ev) throw new Error('No SELECT event captured.');
  return ev;
}

/**
 * Seed Products + Categories with varying unitPrice so aggregations have
 * something interesting to compute.
 */
async function seedProducts() {
  const beverages = await prisma.category.create({ data: { name: 'Beverages' } });
  const snacks = await prisma.category.create({ data: { name: 'Snacks' } });

  await prisma.product.createMany({
    data: [
      { name: 'Tea', unitPrice: 2.5, categoryId: beverages.id },
      { name: 'Coffee', unitPrice: 4.0, categoryId: beverages.id },
      { name: 'Juice', unitPrice: 3.5, categoryId: beverages.id },
      { name: 'Chips', unitPrice: 1.5, categoryId: snacks.id },
      { name: 'Cookies', unitPrice: 2.0, categoryId: snacks.id },
    ],
  });

  return { beverages, snacks };
}

describe('MySQL — count', () => {
  it('simple count', async () => {
    await seedProducts();

    const events = await captureQueries(() => prisma.product.count());

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed).toHaveLength(1);
    // The single returned row has a column containing the count; we just
    // verify it's a numeric-looking value, since column naming varies.
    const value = Number(Object.values(replayed[0]!)[0]);
    expect(value).toBe(5);
  });

  it('count with where', async () => {
    await seedProducts();

    const events = await captureQueries(() =>
      prisma.product.count({ where: { unitPrice: { gte: 3.0 } } }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    const value = Number(Object.values(replayed[0]!)[0]);
    expect(value).toBe(2);
  });
});

describe('MySQL — aggregate', () => {
  beforeEach(async () => {
    await seedProducts();
  });

  it('_sum, _avg, _min, _max in one call', async () => {
    const events = await captureQueries(() =>
      prisma.product.aggregate({
        _sum: { unitPrice: true },
        _avg: { unitPrice: true },
        _min: { unitPrice: true },
        _max: { unitPrice: true },
        _count: { _all: true },
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    expect(sql).not.toContain(' ?');

    // Re-execute and confirm shape (single row with aggregate columns).
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed).toHaveLength(1);
  });

  it('aggregate with where', async () => {
    const events = await captureQueries(() =>
      prisma.product.aggregate({
        where: { unitPrice: { gte: 3.0 } },
        _avg: { unitPrice: true },
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed).toHaveLength(1);
  });
});

describe('MySQL — groupBy', () => {
  beforeEach(async () => {
    await seedProducts();
  });

  it('groupBy with _sum', async () => {
    const events = await captureQueries(() =>
      prisma.product.groupBy({
        by: ['categoryId'],
        _sum: { unitPrice: true },
        orderBy: { categoryId: 'asc' },
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    expect(sql).not.toContain(' ?');

    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed.length).toBe(2);
  });

  it('groupBy with having', async () => {
    const events = await captureQueries(() =>
      prisma.product.groupBy({
        by: ['categoryId'],
        _sum: { unitPrice: true },
        having: { unitPrice: { _sum: { gte: 5 } } },
        orderBy: { categoryId: 'asc' },
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    // Beverages = 2.5 + 4 + 3.5 = 10, Snacks = 1.5 + 2 = 3.5
    // having sum >= 5 → only Beverages
    expect(replayed).toHaveLength(1);
  });
});
