/**
 * Manual testing / demo script.
 * Usage: npx tsx scripts/example.ts
 *
 * Prereq: `npm run test:setup` (Docker MySQL running, schema pushed).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPrismaSqlLogger } from '../src/index.js';

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
});

// Register our logger
const log = createPrismaSqlLogger({
  dialect: 'mysql',
  showDuration: true,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$on('query', log);

async function main() {
  console.log('\n--- CREATE ---');
  const customer = await prisma.customer.create({
    data: { name: "O'Brien", email: `test-${Date.now()}@example.com` },
  });

  console.log('\n--- FIND ---');
  await prisma.customer.findMany({ where: { id: customer.id } });

  console.log('\n--- UPDATE ---');
  await prisma.customer.update({
    where: { id: customer.id },
    data: { name: 'Updated' },
  });

  console.log('\n--- DELETE ---');
  await prisma.customer.delete({ where: { id: customer.id } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
