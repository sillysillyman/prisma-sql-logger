/**
 * PostgreSQL — orderBy and distinct.
 *
 * Note: PostgreSQL supports SQL DISTINCT directly, so unlike MySQL, the
 * replayed SQL deduplicates and we can compare values 1:1 with Prisma.
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

function pickRootSelect(events: QueryEvent[]): QueryEvent {
  const ev = events.find((e) => e.query.startsWith('SELECT'));
  if (!ev) throw new Error('No SELECT event captured.');
  return ev;
}

describe('PostgreSQL — orderBy', () => {
  beforeEach(async () => {
    await prisma.customer.createMany({
      data: [
        { name: 'Bravo', email: 'b@example.com' },
        { name: 'Alpha', email: 'a@example.com' },
        { name: 'Charlie', email: 'c@example.com' },
      ],
    });
  });

  it('single field asc', async () => {
    const events = await captureQueries(() =>
      prisma.customer.findMany({ orderBy: { name: 'asc' } }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed.map((r) => r['name'])).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('single field desc', async () => {
    const events = await captureQueries(() =>
      prisma.customer.findMany({ orderBy: { name: 'desc' } }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed.map((r) => r['name'])).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('multiple fields', async () => {
    await prisma.customer.create({ data: { name: 'Alpha', email: 'a2@example.com' } });

    const events = await captureQueries(() =>
      prisma.customer.findMany({
        orderBy: [{ name: 'asc' }, { email: 'desc' }],
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const original = await prisma.customer.findMany({
      orderBy: [{ name: 'asc' }, { email: 'desc' }],
    });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed.map((r) => r['email'])).toEqual(original.map((o) => o.email));
  });

  it('relation _count ordering', async () => {
    const employee = await prisma.employee.create({
      data: { firstName: 'E', lastName: 'E', hireDate: new Date() },
    });
    const bravo = (await prisma.customer.findUnique({ where: { email: 'b@example.com' } }))!;
    const alpha = (await prisma.customer.findUnique({ where: { email: 'a@example.com' } }))!;
    await prisma.order.createMany({
      data: [
        { customerId: bravo.id, employeeId: employee.id },
        { customerId: bravo.id, employeeId: employee.id },
        { customerId: alpha.id, employeeId: employee.id },
      ],
    });

    const events = await captureQueries(() =>
      prisma.customer.findMany({
        orderBy: { orders: { _count: 'desc' } },
        take: 2,
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const original = await prisma.customer.findMany({
      orderBy: { orders: { _count: 'desc' } },
      take: 2,
    });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed.map((r) => r['email'])).toEqual(original.map((o) => o.email));
  });
});

describe('PostgreSQL — distinct', () => {
  beforeEach(async () => {
    await prisma.customer.createMany({
      data: [
        { name: 'shared', email: 's1@example.com' },
        { name: 'shared', email: 's2@example.com' },
        { name: 'unique', email: 'u@example.com' },
      ],
    });
  });

  // Like MySQL, Prisma compiles `distinct` to a plain SELECT and performs the
  // dedup in JavaScript. So the logged SQL — which is what we interpolate —
  // does not include DISTINCT and returns the raw rows. We verify the SQL is
  // executable; dedup semantics belong to Prisma's runtime.
  it('distinct on one column — logged SQL executes (rows not deduped)', async () => {
    const events = await captureQueries(() =>
      prisma.customer.findMany({ distinct: ['name'], orderBy: { name: 'asc' } }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    // 3 seeded rows come back from the underlying SELECT.
    expect(replayed).toHaveLength(3);
  });

  it('distinct on multiple columns', async () => {
    const events = await captureQueries(() =>
      prisma.customer.findMany({
        distinct: ['name', 'email'],
        orderBy: { email: 'asc' },
      }),
    );

    const sql = toSql(pickRootSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    const original = await prisma.customer.findMany({
      distinct: ['name', 'email'],
      orderBy: { email: 'asc' },
    });
    expect(replayed.length).toBe(original.length);
  });
});
