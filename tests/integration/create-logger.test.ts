import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createPrismaSqlLogger } from '../../src/index.js';

const createPrisma = () =>
  new PrismaClient({
    log: [{ emit: 'event', level: 'query' }],
  });

let prisma: ReturnType<typeof createPrisma>;

describe('createPrismaSqlLogger (end-to-end with real Prisma)', () => {
  beforeAll(async () => {
    prisma = createPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.typeTest.deleteMany();
  });

  it('logs runnable SQL for a real query via custom logger', async () => {
    const captured: Array<{ sql: string; duration: number }> = [];
    const log = createPrismaSqlLogger({
      dialect: 'mysql',
      logger: (sql, meta) => captured.push({ sql, duration: meta.duration }),
    });
    prisma.$on('query', log);

    await prisma.typeTest.create({
      data: {
        str: "O'Brien",
        text: 'body',
        num: 42,
        float: 3.14,
        big: 1n,
        bool: true,
        date: new Date('2026-01-01T00:00:00Z'),
        bytes: Buffer.alloc(0),
        json: { k: 'v' },
        optional: null,
      },
    });

    // Ensure events flushed
    await new Promise((r) => setTimeout(r, 100));

    const insertLog = captured.find((e) => e.sql.includes('INSERT'));
    expect(insertLog).toBeDefined();
    expect(insertLog!.sql).toContain("'O''Brien'");
    expect(insertLog!.sql).toContain('42');
    expect(insertLog!.sql).toContain('3.14');
    expect(insertLog!.sql).not.toContain('?');
    expect(typeof insertLog!.duration).toBe('number');
  });

  it('logged SQL can be executed against the same database', async () => {
    await prisma.typeTest.create({
      data: {
        str: 'exec test',
        text: 'body',
        num: 99,
        float: 1.0,
        big: 1n,
        bool: false,
        date: new Date('2026-01-01T00:00:00Z'),
        bytes: Buffer.alloc(0),
        json: {},
        optional: null,
      },
    });

    const captured: string[] = [];
    const log = createPrismaSqlLogger({
      dialect: 'mysql',
      logger: (sql) => captured.push(sql),
    });
    prisma.$on('query', log);

    await prisma.typeTest.findMany({ where: { str: 'exec test' } });
    await new Promise((r) => setTimeout(r, 100));

    const selectSql = captured.find((s) => s.startsWith('SELECT') && s.includes("'exec test'"));
    expect(selectSql).toBeDefined();

    // Re-execute the logged SQL as raw and expect the same result shape
    const result = (await prisma.$queryRawUnsafe(selectSql!)) as unknown[];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it('showDuration prepends (Nms) prefix with default logger', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: unknown) => {
      if (typeof msg === 'string') logs.push(msg);
    };

    try {
      const log = createPrismaSqlLogger({ dialect: 'mysql', showDuration: true });
      prisma.$on('query', log);

      await prisma.typeTest.findMany();
      await new Promise((r) => setTimeout(r, 100));

      const prefixed = logs.find((s) => /^\(\d+ms\) /.test(s));
      expect(prefixed).toBeDefined();
    } finally {
      console.log = originalLog;
    }
  });
});
