/**
 * PostgreSQL — cursor pagination.
 * Mirrors the MySQL pagination tests.
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

describe('PostgreSQL — cursor pagination', () => {
  beforeEach(async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.customer.create({
        data: { name: `c${i}`, email: `c${i}@example.com` },
      });
    }
  });

  it('cursor + take', async () => {
    const all = await prisma.customer.findMany({ orderBy: { id: 'asc' } });
    const fifth = all[4]!;

    const events = await captureQueries(() =>
      prisma.customer.findMany({
        cursor: { id: fifth.id },
        take: 3,
        orderBy: { id: 'asc' },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);

    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(3);
  });

  it('cursor + skip + take', async () => {
    const all = await prisma.customer.findMany({ orderBy: { id: 'asc' } });
    const third = all[2]!;

    const events = await captureQueries(() =>
      prisma.customer.findMany({
        cursor: { id: third.id },
        skip: 1,
        take: 2,
        orderBy: { id: 'asc' },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const original = await prisma.customer.findMany({
      cursor: { id: third.id },
      skip: 1,
      take: 2,
      orderBy: { id: 'asc' },
    });
    const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
    expect(replayed.length).toBe(original.length);
    expect(replayed[0]!['email']).toBe(original[0]!.email);
  });

  it('reverse cursor pagination (negative take)', async () => {
    const all = await prisma.customer.findMany({ orderBy: { id: 'asc' } });
    const seventh = all[6]!;

    const events = await captureQueries(() =>
      prisma.customer.findMany({
        cursor: { id: seventh.id },
        take: -3,
        orderBy: { id: 'asc' },
      }),
    );

    const sql = toSql(pickWhereSelect(events), DIALECT);
    const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
    expect(replayed).toHaveLength(3);
  });
});
