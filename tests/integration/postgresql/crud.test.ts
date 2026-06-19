/**
 * PostgreSQL — CRUD operations that the original postgresql.test.ts did not cover:
 *   - findUnique / findUniqueOrThrow / findFirstOrThrow
 *   - createMany
 *   - updateMany
 *   - upsert
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  attachCapture,
  cleanDatabase,
  createPrisma,
  findSelectMatching,
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

describe('PostgreSQL CRUD — additional operations', () => {
  describe('findUnique', () => {
    it('produces an executable SELECT by unique id', async () => {
      const created = await prisma.customer.create({
        data: { name: 'unique', email: 'unique@example.com' },
      });

      const events = await captureQueries(() =>
        prisma.customer.findUnique({ where: { id: created.id } }),
      );

      const { sql } = findSelectMatching(events, DIALECT, (s) =>
        s.includes(`= ${created.id}`),
      );

      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
      expect(replayed).toHaveLength(1);
      expect(replayed[0]!['email']).toBe('unique@example.com');
    });

    it('produces an executable SELECT by unique field other than id', async () => {
      await prisma.customer.create({
        data: { name: 'byemail', email: 'byemail@example.com' },
      });

      const events = await captureQueries(() =>
        prisma.customer.findUnique({ where: { email: 'byemail@example.com' } }),
      );

      const { sql } = findSelectMatching(events, DIALECT, (s) =>
        s.includes("'byemail@example.com'"),
      );

      const replayed = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];
      expect(replayed).toHaveLength(1);
    });
  });

  describe('findUniqueOrThrow / findFirstOrThrow', () => {
    it('findUniqueOrThrow emits an executable SELECT', async () => {
      const created = await prisma.customer.create({
        data: { name: 'orthrow', email: 'orthrow@example.com' },
      });

      const events = await captureQueries(() =>
        prisma.customer.findUniqueOrThrow({ where: { id: created.id } }),
      );

      const { sql } = findSelectMatching(events, DIALECT, (s) =>
        s.includes(`= ${created.id}`),
      );
      const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
      expect(replayed).toHaveLength(1);
    });

    it('findFirstOrThrow emits an executable SELECT', async () => {
      await prisma.customer.create({
        data: { name: 'firstorthrow', email: 'firstorthrow@example.com' },
      });

      const events = await captureQueries(() =>
        prisma.customer.findFirstOrThrow({ where: { name: 'firstorthrow' } }),
      );

      const { sql } = findSelectMatching(events, DIALECT, (s) =>
        s.includes("'firstorthrow'"),
      );
      const replayed = (await prisma.$queryRawUnsafe(sql)) as unknown[];
      expect(replayed).toHaveLength(1);
    });
  });

  describe('createMany', () => {
    it('produces an executable bulk INSERT', async () => {
      const events = await captureQueries(() =>
        prisma.customer.createMany({
          data: [
            { name: 'bulk1', email: 'bulk1@example.com' },
            { name: 'bulk2', email: 'bulk2@example.com' },
            { name: 'bulk3', email: 'bulk3@example.com' },
          ],
        }),
      );

      const insertEvent = events.find((e) => e.query.startsWith('INSERT'));
      expect(insertEvent).toBeDefined();

      const sql = toSql(insertEvent!, DIALECT);
      expect(sql).toContain("'bulk1@example.com'");
      expect(sql).toContain("'bulk2@example.com'");
      expect(sql).toContain("'bulk3@example.com'");
      expect(sql).not.toMatch(/\$\d/);

      const count = await prisma.customer.count();
      expect(count).toBe(3);
    });
  });

  describe('updateMany', () => {
    it('produces an executable UPDATE matching the same rows', async () => {
      await prisma.customer.createMany({
        data: [
          { name: 'umA', email: 'umA@example.com' },
          { name: 'umB', email: 'umB@example.com' },
          { name: 'untouched', email: 'untouched@example.com' },
        ],
      });

      const events = await captureQueries(() =>
        prisma.customer.updateMany({
          where: { name: { startsWith: 'um' } },
          data: { name: 'updated' },
        }),
      );

      const updateEvent = events.find((e) => e.query.startsWith('UPDATE'));
      expect(updateEvent).toBeDefined();

      const sql = toSql(updateEvent!, DIALECT);
      expect(sql).toContain("'updated'");
      expect(sql).not.toMatch(/\$\d/);

      const updated = await prisma.customer.findMany({ where: { name: 'updated' } });
      expect(updated).toHaveLength(2);
    });
  });

  describe('upsert', () => {
    it('emits an executable SQL pipeline (existing record → UPDATE)', async () => {
      const existing = await prisma.customer.create({
        data: { name: 'before', email: 'upsert@example.com' },
      });

      const events = await captureQueries(() =>
        prisma.customer.upsert({
          where: { email: 'upsert@example.com' },
          create: { name: 'created', email: 'upsert@example.com' },
          update: { name: 'updated' },
        }),
      );

      const interpolated = events.map((e) => toSql(e, DIALECT));
      // Any leftover $N placeholder would indicate a broken interpolation.
      expect(interpolated.every((s) => !/\$\d/.test(s))).toBe(true);

      const after = await prisma.customer.findUnique({ where: { id: existing.id } });
      expect(after?.name).toBe('updated');
    });

    it('emits an executable SQL pipeline (missing record → INSERT)', async () => {
      const events = await captureQueries(() =>
        prisma.customer.upsert({
          where: { email: 'new-upsert@example.com' },
          create: { name: 'created', email: 'new-upsert@example.com' },
          update: { name: 'updated' },
        }),
      );

      const insertEvent = events.find((e) => e.query.startsWith('INSERT'));
      expect(insertEvent).toBeDefined();
      const sql = toSql(insertEvent!, DIALECT);
      expect(sql).toContain("'new-upsert@example.com'");
      expect(sql).toContain("'created'");
      expect(sql).not.toMatch(/\$\d/);

      const after = await prisma.customer.findUnique({
        where: { email: 'new-upsert@example.com' },
      });
      expect(after?.name).toBe('created');
    });
  });
});
