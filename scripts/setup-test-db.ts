/**
 * Set up test databases for integration testing.
 *
 * Usage: npx tsx scripts/setup-test-db.ts
 *
 * 1. Create .env from .env.example (if not exists)
 * 2. Start Docker containers (MySQL + PostgreSQL)
 * 3. Wait for databases to be ready
 * 4. For each dialect:
 *    - Generate prisma/schema.prisma
 *    - prisma db push
 * 5. Regenerate schema for the default dialect (MySQL) and run prisma generate
 *    so the Prisma Client is usable after setup.
 */
import { execSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
process.chdir(ROOT);

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', shell: 'true' });
}

function runSilent(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: 'ignore', shell: 'true' });
    return true;
  } catch {
    return false;
  }
}

// 1. Create .env if not exists
if (!existsSync(resolve(ROOT, '.env'))) {
  console.log('Creating .env from .env.example...');
  copyFileSync(resolve(ROOT, '.env.example'), resolve(ROOT, '.env'));
}

// 2. Start containers
console.log('Starting database containers...');
run('docker compose up -d');

// 3. Wait for databases
console.log('Waiting for MySQL...');
while (!runSilent('docker compose exec mysql mysqladmin ping -h localhost')) {
  await sleep(2000);
}
console.log('MySQL is ready.');

console.log('Waiting for PostgreSQL...');
while (!runSilent('docker compose exec postgres pg_isready -U prisma -q')) {
  await sleep(2000);
}
console.log('PostgreSQL is ready.');

// 4. Push schema for each dialect (multi-file schema: --schema prisma)
const dialects = ['mysql', 'postgresql'] as const;
for (const dialect of dialects) {
  console.log(`\n--- ${dialect} ---`);
  run(`npx tsx scripts/generate-schema.ts ${dialect}`);
  run('npx prisma db push --schema prisma --skip-generate');
}

// 5. Leave schema as MySQL (default) and generate Prisma Client
console.log('\n--- Finalizing ---');
run('npx tsx scripts/generate-schema.ts mysql');
run('npx prisma generate --schema prisma');

console.log("\nDone! Run 'npm run test:integration' to execute tests.");
