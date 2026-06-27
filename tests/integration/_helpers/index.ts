/**
 * Shared helpers for integration tests.
 *
 * Tests in `tests/integration/{mysql,postgresql}/` import from here to:
 *   - construct a Prisma client with query-event logging enabled
 *   - capture emitted query events during a test action
 *   - interpolate captured events into runnable SQL via this library
 *   - verify the interpolated SQL is executable against the same database
 */
import { PrismaClient } from '@prisma/client';
import { expect } from 'vitest';
import { interpolate } from '../../../src/interpolate.js';
import { parseParams } from '../../../src/parse-params.js';
import type { DialectName } from '../../../src/index.js';

export interface QueryEvent {
  query: string;
  params: string;
  duration: number;
}

export const createPrisma = () =>
  new PrismaClient({
    log: [{ emit: 'event', level: 'query' }],
  });

export type PrismaTestClient = ReturnType<typeof createPrisma>;

const TRANSACTION_STATEMENTS = new Set(['BEGIN', 'COMMIT', 'ROLLBACK']);

/**
 * Attach a query-event listener that pushes non-transactional statements into
 * the provided buffer. Returns a `captureQueries(fn)` function: call it with
 * an async action, and it returns the events captured during that action.
 */
export function attachCapture(prisma: PrismaTestClient): {
  captureQueries: (fn: () => Promise<unknown>) => Promise<QueryEvent[]>;
} {
  let buffer: QueryEvent[] = [];
  prisma.$on('query', (e) => {
    if (!TRANSACTION_STATEMENTS.has(e.query)) {
      buffer.push(e);
    }
  });

  return {
    captureQueries: async (fn) => {
      buffer = [];
      await fn();
      await new Promise((r) => setTimeout(r, 100));
      return buffer;
    },
  };
}

/**
 * Interpolate a captured event into a runnable SQL string for the given dialect.
 */
export function toSql(event: QueryEvent, dialect: DialectName): string {
  return interpolate(event.query, parseParams(event.params), dialect);
}

/**
 * Execute every captured SELECT through `$queryRawUnsafe`. Asserts each one
 * returns an array (i.e. did not throw). Use for "the interpolated SQL is at
 * least syntactically valid + executable" smoke checks across an event batch.
 */
export async function assertAllSelectsExecutable(
  prisma: PrismaTestClient,
  events: QueryEvent[],
  dialect: DialectName,
): Promise<void> {
  const selects = events.filter((e) => e.query.startsWith('SELECT'));
  expect(selects.length).toBeGreaterThanOrEqual(1);
  for (const e of selects) {
    const sql = toSql(e, dialect);
    const rows = await prisma.$queryRawUnsafe(sql);
    expect(Array.isArray(rows)).toBe(true);
  }
}

/**
 * Find the first SELECT event whose interpolated SQL matches `predicate`.
 * Throws via `expect` if none match.
 */
export function findSelectMatching(
  events: QueryEvent[],
  dialect: DialectName,
  predicate: (sql: string) => boolean,
): { event: QueryEvent; sql: string } {
  for (const event of events) {
    if (!event.query.startsWith('SELECT')) continue;
    const sql = toSql(event, dialect);
    if (predicate(sql)) return { event, sql };
  }
  expect.fail(
    `No SELECT event matched the predicate. Got: ${events.map((e) => e.query).join('\n')}`,
  );
}

/**
 * Seed a minimal Northwind dataset and return the created records.
 * Centralized so all relation/aggregation tests share one fixture shape.
 */
export async function seedNorthwind(prisma: PrismaTestClient) {
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
 * Delete all rows across every model in dependency order. Use in `beforeEach`
 * to give each test a clean database.
 */
export async function cleanDatabase(prisma: PrismaTestClient): Promise<void> {
  await prisma.orderDetail.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.employeeProfile.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.typeTest.deleteMany();
}
