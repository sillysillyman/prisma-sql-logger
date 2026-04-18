import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { interpolate } from '../../src/interpolate.js';
import { parseParams } from '../../src/parse-params.js';

interface QueryEvent {
  query: string;
  params: string;
  duration: number;
}

let prisma: PrismaClient;
let capturedEvents: QueryEvent[] = [];

/**
 * Capture all query events emitted during `fn()`.
 * Filters out transaction control statements (BEGIN, COMMIT, ROLLBACK).
 */
async function captureQueries(fn: () => Promise<unknown>): Promise<QueryEvent[]> {
  capturedEvents = [];
  await fn();
  await new Promise((r) => setTimeout(r, 100));
  return capturedEvents;
}

/**
 * Helper: interpolate a captured query event into executable SQL.
 */
function toSql(event: QueryEvent): string {
  return interpolate(event.query, parseParams(event.params), 'mysql');
}

describe('MySQL integration', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      log: [{ emit: 'event', level: 'query' }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$on('query', (e: QueryEvent) => {
      if (!['BEGIN', 'COMMIT', 'ROLLBACK'].includes(e.query)) {
        capturedEvents.push(e);
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.orderDetail.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.employeeProfile.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.typeTest.deleteMany();
  });

  describe('query event shape', () => {
    it('emits query, params (string), and duration (number)', async () => {
      const events = await captureQueries(() => prisma.typeTest.findMany());

      expect(events.length).toBeGreaterThan(0);
      const event = events[0]!;
      expect(typeof event.query).toBe('string');
      expect(typeof event.params).toBe('string');
      expect(typeof event.duration).toBe('number');
    });

    it('uses ? placeholders for MySQL', async () => {
      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { id: 999 } }),
      );

      const selectEvent = events.find((e) => e.query.includes('WHERE'));
      expect(selectEvent).toBeDefined();
      expect(selectEvent!.query).toContain('?');
      expect(selectEvent!.query).not.toMatch(/\$\d+/);
    });
  });

  describe('interpolated SQL returns identical results', () => {
    it('SELECT by string (with special characters)', async () => {
      await prisma.typeTest.create({
        data: {
          str: "O'Brien",
          text: 'body',
          num: 1,
          float: 1.0,
          big: 1n,
          bool: false,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { str: "O'Brien" } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ where: { str: "O'Brien" } });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed[0]!['str']).toBe(original[0]!.str);
    });

    it('SELECT by integer', async () => {
      await prisma.typeTest.create({
        data: {
          str: 'num-test',
          text: 'body',
          num: 42,
          float: 1.0,
          big: 1n,
          bool: false,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { num: 42 } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ where: { num: 42 } });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed[0]!['num']).toBe(original[0]!.num);
    });

    it('SELECT by boolean', async () => {
      await prisma.typeTest.create({
        data: {
          str: 'bool-test',
          text: 'body',
          num: 1,
          float: 1.0,
          big: 1n,
          bool: true,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { bool: true } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ where: { bool: true } });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      // MySQL returns TINYINT(1) as 1/0 via raw query, Prisma ORM converts to true/false.
      // The interpolated SQL is correct — just compare as numbers.
      expect(replayed[0]!['bool']).toBe(1);
    });

    it('SELECT by date range', async () => {
      const date = new Date('2026-06-15T10:30:00.000Z');
      await prisma.typeTest.create({
        data: {
          str: 'date-test',
          text: 'body',
          num: 1,
          float: 1.0,
          big: 1n,
          bool: false,
          date,
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({
          where: {
            date: { gte: new Date('2026-06-01T00:00:00Z') },
          },
        }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({
        where: { date: { gte: new Date('2026-06-01T00:00:00Z') } },
      });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(new Date(replayed[0]!['date'] as string).toISOString()).toBe(date.toISOString());
    });

    it('SELECT by number comparison (gte)', async () => {
      await prisma.typeTest.create({
        data: {
          str: 'gte-test',
          text: 'body',
          num: 100,
          float: 9.99,
          big: 1n,
          bool: false,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { num: { gte: 50 } } }),
      );
      const selectEvent = events.find((e) => e.query.includes('>='))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ where: { num: { gte: 50 } } });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed[0]!['num']).toBe(original[0]!.num);
      expect(replayed[0]!['float']).toBe(original[0]!.float);
    });

    it('SELECT with null optional field', async () => {
      await prisma.typeTest.create({
        data: {
          str: 'null-opt',
          text: 'body',
          num: 1,
          float: 1.0,
          big: 1n,
          bool: false,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { optional: null } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ where: { optional: null } });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed[0]!['optional']).toBe(null);
    });

    it('SELECT with non-null optional field', async () => {
      await prisma.typeTest.create({
        data: {
          str: 'opt-set',
          text: 'body',
          num: 1,
          float: 1.0,
          big: 1n,
          bool: false,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: 'hello',
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { optional: 'hello' } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ where: { optional: 'hello' } });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed[0]!['optional']).toBe('hello');
    });

    it('SELECT with multiple conditions (AND)', async () => {
      await prisma.typeTest.create({
        data: {
          str: 'multi',
          text: 'body',
          num: 77,
          float: 1.0,
          big: 1n,
          bool: true,
          date: new Date('2026-01-01T00:00:00Z'),
          bytes: Buffer.alloc(0),
          json: {},
          optional: null,
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ where: { str: 'multi', num: 77, bool: true } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({
        where: { str: 'multi', num: 77, bool: true },
      });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed[0]!['str']).toBe('multi');
      expect(replayed[0]!['num']).toBe(77);
    });

    it('SELECT with LIMIT and OFFSET', async () => {
      for (let i = 0; i < 5; i++) {
        await prisma.typeTest.create({
          data: {
            str: `page-${i}`,
            text: 'body',
            num: i,
            float: 1.0,
            big: 1n,
            bool: false,
            date: new Date('2026-01-01T00:00:00Z'),
            bytes: Buffer.alloc(0),
            json: {},
            optional: null,
          },
        });
      }

      const events = await captureQueries(() =>
        prisma.typeTest.findMany({ take: 2, skip: 1 }),
      );
      const selectEvent = events.find((e) => e.query.includes('LIMIT'))!;
      const sql = toSql(selectEvent);

      const original = await prisma.typeTest.findMany({ take: 2, skip: 1 });
      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(original.length);
      expect(replayed.length).toBe(2);
    });

    it('SELECT findFirst by id returns identical row', async () => {
      const created = await prisma.typeTest.create({
        data: {
          str: 'find-first',
          text: 'detailed body',
          num: 999,
          float: 3.14,
          big: 42n,
          bool: true,
          date: new Date('2026-04-08T12:34:56.789Z'),
          bytes: Buffer.alloc(0),
          json: { nested: { deep: true } },
          optional: 'present',
        },
      });

      const events = await captureQueries(() =>
        prisma.typeTest.findFirst({ where: { id: created.id } }),
      );
      const selectEvent = events.find((e) => e.query.includes('WHERE'))!;
      const sql = toSql(selectEvent);

      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

      expect(replayed.length).toBe(1);
      const row = replayed[0]!;
      expect(row['id']).toBe(created.id);
      expect(row['str']).toBe(created.str);
      expect(row['text']).toBe(created.text);
      expect(row['num']).toBe(created.num);
      expect(row['float']).toBe(created.float);
      expect(row['bool']).toBe(created.bool ? 1 : 0);
      expect(row['optional']).toBe(created.optional);
    });
  });

  describe('blob handling', () => {
    it('preserves <N bytes blob> as-is in interpolated output', async () => {
      const events = await captureQueries(() =>
        prisma.typeTest.create({
          data: {
            str: 'blob test',
            text: 'body',
            num: 1,
            float: 1.0,
            big: 1n,
            bool: false,
            date: new Date(),
            bytes: Buffer.from([0xde, 0xad, 0xbe, 0xef]),
            json: {},
            optional: null,
          },
        }),
      );

      const insertEvent = events.find((e) => e.query.includes('INSERT'));
      expect(insertEvent).toBeDefined();

      const sql = toSql(insertEvent!);
      expect(sql).toContain("'<4 bytes blob>'");
    });
  });

  // ─── Northwind relation tests ───

  async function seedNorthwind() {
    const customer = await prisma.customer.create({
      data: { name: 'John Doe', email: 'john@example.com' },
    });

    const employee = await prisma.employee.create({
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        hireDate: new Date('2024-01-15T00:00:00Z'),
        profile: {
          create: { phone: '010-1234-5678', address: '123 Main St' },
        },
      },
    });

    const category = await prisma.category.create({
      data: { name: 'Beverages' },
    });

    const product1 = await prisma.product.create({
      data: { name: 'Green Tea', unitPrice: 2.5, categoryId: category.id },
    });

    const product2 = await prisma.product.create({
      data: { name: 'Coffee', unitPrice: 3.0, categoryId: category.id },
    });

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        employeeId: employee.id,
        orderDetails: {
          create: [
            { productId: product1.id, quantity: 10, discount: 0 },
            { productId: product2.id, quantity: 5, discount: 0.1 },
          ],
        },
      },
    });

    return { customer, employee, category, product1, product2, order };
  }

  /**
   * Replay all captured SELECT queries against MySQL.
   * Every one must execute without error.
   */
  async function assertAllSelectsExecutable(events: QueryEvent[]) {
    const selects = events.filter((e) => e.query.startsWith('SELECT'));
    expect(selects.length).toBeGreaterThanOrEqual(1);
    for (const e of selects) {
      const sql = toSql(e);
      const rows = await prisma.$queryRawUnsafe(sql);
      expect(Array.isArray(rows)).toBe(true);
    }
  }

  describe('relation queries', () => {
    it('1:N — customer → orders (include)', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.customer.findMany({ include: { orders: true } }),
      );

      await assertAllSelectsExecutable(events);
    });

    it('1:1 — employee → profile (include)', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.employee.findMany({ include: { profile: true } }),
      );

      await assertAllSelectsExecutable(events);
    });

    it('nested include (2 levels) — order → orderDetails → product', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.order.findMany({
          include: {
            orderDetails: {
              include: { product: true },
            },
          },
        }),
      );

      await assertAllSelectsExecutable(events);
    });

    it('nested include (3 levels) — customer → orders → orderDetails → product', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.customer.findMany({
          include: {
            orders: {
              include: {
                orderDetails: {
                  include: { product: true },
                },
              },
            },
          },
        }),
      );

      // At least 4 queries: customer, orders, orderDetails, products
      const selects = events.filter((e) => e.query.startsWith('SELECT'));
      expect(selects.length).toBeGreaterThanOrEqual(4);
      await assertAllSelectsExecutable(events);
    });

    it('nested select — specific fields across relations', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.customer.findMany({
          select: {
            name: true,
            orders: {
              select: {
                orderDate: true,
                orderDetails: {
                  select: {
                    quantity: true,
                    product: {
                      select: { name: true, unitPrice: true },
                    },
                  },
                },
              },
            },
          },
        }),
      );

      await assertAllSelectsExecutable(events);
    });

    it('multiple includes — order → customer + employee + orderDetails', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.order.findMany({
          include: {
            customer: true,
            employee: true,
            orderDetails: true,
          },
        }),
      );

      await assertAllSelectsExecutable(events);
    });

    it('relation filter — where: { orders: { some: ... } }', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.customer.findMany({
          where: {
            orders: {
              some: {
                orderDetails: {
                  some: { quantity: { gte: 5 } },
                },
              },
            },
          },
        }),
      );

      await assertAllSelectsExecutable(events);
    });

    it('relation filter — where: { orders: { none: {} } }', async () => {
      await seedNorthwind();

      const events = await captureQueries(() =>
        prisma.customer.findMany({
          where: { orders: { none: {} } },
        }),
      );

      const selects = events.filter((e) => e.query.startsWith('SELECT'));
      for (const e of selects) {
        const sql = toSql(e);
        const rows = (await prisma.$queryRawUnsafe(sql)) as unknown[];
        expect(Array.isArray(rows)).toBe(true);
        expect(rows.length).toBe(0);
      }
    });

    it('3-level include returns correct data', async () => {
      const { customer } = await seedNorthwind();

      const original = await prisma.customer.findFirst({
        where: { id: customer.id },
        include: {
          orders: {
            include: {
              orderDetails: {
                include: { product: true },
              },
            },
          },
        },
      });

      const events = await captureQueries(() =>
        prisma.customer.findFirst({
          where: { id: customer.id },
          include: {
            orders: {
              include: {
                orderDetails: {
                  include: { product: true },
                },
              },
            },
          },
        }),
      );

      await assertAllSelectsExecutable(events);

      // Verify customer data from the first query
      const customerEvent = events.find((e) => e.query.includes('`Customer`'))!;
      const replayedCustomers = (await prisma.$queryRawUnsafe(
        toSql(customerEvent),
      )) as Record<string, unknown>[];
      expect(replayedCustomers[0]!['name']).toBe(original!.name);
      expect(replayedCustomers[0]!['email']).toBe(original!.email);
    });
  });
});
