/**
 * PostgreSQL — atomic field-update operators (increment, decrement, multiply, divide).
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

function pickUpdate(events: QueryEvent[]): QueryEvent {
  const ev = events.find((e) => e.query.startsWith('UPDATE'));
  if (!ev) throw new Error('No UPDATE event captured.');
  return ev;
}

async function seedProduct(unitPrice: number) {
  const cat = await prisma.category.create({ data: { name: 'C' } });
  return prisma.product.create({
    data: { name: 'P', unitPrice, categoryId: cat.id },
  });
}

describe('PostgreSQL — atomic numeric updates', () => {
  it('increment', async () => {
    const p = await seedProduct(10);
    const events = await captureQueries(() =>
      prisma.product.update({
        where: { id: p.id },
        data: { unitPrice: { increment: 5 } },
      }),
    );

    const sql = toSql(pickUpdate(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);
    expect(sql).toContain('5');

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.unitPrice).toBe(15);
  });

  it('decrement', async () => {
    const p = await seedProduct(10);
    const events = await captureQueries(() =>
      prisma.product.update({
        where: { id: p.id },
        data: { unitPrice: { decrement: 3 } },
      }),
    );

    const sql = toSql(pickUpdate(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.unitPrice).toBe(7);
  });

  it('multiply', async () => {
    const p = await seedProduct(10);
    const events = await captureQueries(() =>
      prisma.product.update({
        where: { id: p.id },
        data: { unitPrice: { multiply: 2 } },
      }),
    );

    const sql = toSql(pickUpdate(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.unitPrice).toBe(20);
  });

  it('divide', async () => {
    const p = await seedProduct(10);
    const events = await captureQueries(() =>
      prisma.product.update({
        where: { id: p.id },
        data: { unitPrice: { divide: 4 } },
      }),
    );

    const sql = toSql(pickUpdate(events), DIALECT);
    expect(sql).not.toMatch(/\$\d/);

    const after = await prisma.product.findUnique({ where: { id: p.id } });
    expect(after?.unitPrice).toBe(2.5);
  });
});
