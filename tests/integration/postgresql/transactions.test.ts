/**
 * PostgreSQL — $transaction (array and interactive forms).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  attachCapture,
  cleanDatabase,
  createPrisma,
  toSql,
  type PrismaTestClient,
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

describe('PostgreSQL — $transaction', () => {
  it('array form: each inner statement interpolates cleanly', async () => {
    const events = await captureQueries(() =>
      prisma.$transaction([
        prisma.customer.create({ data: { name: 'tx1', email: 'tx1@example.com' } }),
        prisma.customer.create({ data: { name: 'tx2', email: 'tx2@example.com' } }),
      ]),
    );

    for (const e of events) {
      const sql = toSql(e, DIALECT);
      expect(sql).not.toMatch(/\$\d/);
    }

    const inserts = events.filter((e) => e.query.startsWith('INSERT'));
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });

  it('interactive form: statements inside the callback interpolate cleanly', async () => {
    const events = await captureQueries(() =>
      prisma.$transaction(async (tx) => {
        const created = await tx.customer.create({
          data: { name: 'inner', email: 'inner@example.com' },
        });
        await tx.customer.update({
          where: { id: created.id },
          data: { name: 'inner-updated' },
        });
      }),
    );

    for (const e of events) {
      const sql = toSql(e, DIALECT);
      expect(sql).not.toMatch(/\$\d/);
    }

    const insertEvent = events.find((e) => e.query.startsWith('INSERT'));
    expect(insertEvent).toBeDefined();
    expect(toSql(insertEvent!, DIALECT)).toContain("'inner@example.com'");

    const updateEvent = events.find((e) => e.query.startsWith('UPDATE'));
    expect(updateEvent).toBeDefined();
    expect(toSql(updateEvent!, DIALECT)).toContain("'inner-updated'");
  });

  it('rolled-back transaction still produces interpolatable events', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.customer.create({
          data: { name: 'rollback', email: 'rollback@example.com' },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const events = await captureQueries(() => Promise.resolve());
    for (const e of events) {
      const sql = toSql(e, DIALECT);
      expect(typeof sql).toBe('string');
    }

    const exists = await prisma.customer.findUnique({
      where: { email: 'rollback@example.com' },
    });
    expect(exists).toBeNull();
  });
});
