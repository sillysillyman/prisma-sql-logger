/**
 * Set up test databases for integration testing.
 *
 * Usage: npx tsx scripts/setup-test-db.ts
 *
 * 1. Create .env from .env.example (if not exists)
 * 2. Start Docker containers
 * 3. Wait for databases to be ready
 * 4. Generate dialect-specific Prisma schemas
 * 5. Push schemas to databases
 * 6. Generate Prisma Client
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

// 2. Start Docker containers
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

// 4. Generate schemas
console.log('Generating Prisma schemas...');
run('npx tsx scripts/generate-schema.ts');

// 5. Push to databases
console.log('Pushing schema to MySQL...');
run('npx prisma db push --schema prisma/generated/mysql.prisma --skip-generate');

console.log('Pushing schema to PostgreSQL...');
run('npx prisma db push --schema prisma/generated/postgresql.prisma --skip-generate');

// 6. Generate Prisma Client
console.log('Generating Prisma Client...');
run('npx prisma generate --schema prisma/generated/mysql.prisma');

console.log("\nDone! Run 'npm run test:integration' to execute tests.");
