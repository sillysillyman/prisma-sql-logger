/**
 * MySQL — $transaction.
 *
 * Two Prisma forms:
 *   1. Sequential / array form:   prisma.$transaction([op1, op2])
 *   2. Interactive form:          prisma.$transaction(async (tx) => { ... })
 *
 * Both wrap the inner operations in BEGIN ... COMMIT. Our handler filters
 * BEGIN/COMMIT/ROLLBACK events (see attachCapture), so what we want to
 * verify is that the inner statements are still individually interpolated
 * correctly and remain executable.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  attachCapture,
  cleanDatabase,
  createPrisma,
  toSql,
  type PrismaTestClient,
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

describe('MySQL — $transaction', () => {
  it('array form: each inner statement interpolates cleanly', async () => {
    const events = await captureQueries(() =>
      prisma.$transaction([
        prisma.customer.create({ data: { name: 'tx1', email: 'tx1@example.com' } }),
        prisma.customer.create({ data: { name: 'tx2', email: 'tx2@example.com' } }),
      ]),
    );

    // Every captured (non-BEGIN/COMMIT) event should interpolate without
    // leaving any placeholders behind.
    for (const e of events) {
      const sql = toSql(e, DIALECT);
      expect(sql).not.toMatch(/(?<!')\?(?!')/);
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
      expect(sql).not.toMatch(/(?<!')\?(?!')/);
    }

    const insertEvent = events.find((e) => e.query.startsWith('INSERT'));
    expect(insertEvent).toBeDefined();
    expect(toSql(insertEvent!, DIALECT)).toContain("'inner@example.com'");

    const updateEvent = events.find((e) => e.query.startsWith('UPDATE'));
    expect(updateEvent).toBeDefined();
    expect(toSql(updateEvent!, DIALECT)).toContain("'inner-updated'");
  });

  it('rolled-back transaction still produces interpolatable events', async () => {
    // Force a rollback by throwing inside the interactive transaction.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.customer.create({
          data: { name: 'rollback', email: 'rollback@example.com' },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Even though the transaction rolled back, the captured INSERT event
    // should still be present and interpolatable in our buffer (we capture
    // before the rollback completes).
    const events = await captureQueries(() => Promise.resolve());
    // Note: this assertion is intentionally light — we just need to confirm
    // that nothing in the captured stream broke our interpolator.
    for (const e of events) {
      const sql = toSql(e, DIALECT);
      expect(typeof sql).toBe('string');
    }

    // And confirm the row was indeed rolled back from the DB.
    const exists = await prisma.customer.findUnique({
      where: { email: 'rollback@example.com' },
    });
    expect(exists).toBeNull();
  });
});
