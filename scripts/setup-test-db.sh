#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# 1. Create .env if not exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

# 2. Load environment variables
set -a
source .env
set +a

# 3. Start databases
echo "Starting database containers..."
docker compose up -d

# 4. Wait for databases to be ready
echo "Waiting for MySQL..."
until docker compose exec mysql mysqladmin ping -h localhost --silent 2>/dev/null; do
  sleep 2
done
echo "MySQL is ready."

echo "Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U prisma -q 2>/dev/null; do
  sleep 2
done
echo "PostgreSQL is ready."

# 5. Generate dialect-specific schemas
echo "Generating Prisma schemas..."
npx tsx scripts/generate-schema.ts

# 6. Push schema to each database (no migration history needed for test DBs)
echo "Pushing schema to MySQL..."
npx prisma db push --schema prisma/generated/mysql.prisma --skip-generate

echo "Pushing schema to PostgreSQL..."
npx prisma db push --schema prisma/generated/postgresql.prisma --skip-generate

# 7. Generate Prisma Client (use MySQL schema — models are identical)
echo "Generating Prisma Client..."
npx prisma generate --schema prisma/generated/mysql.prisma

echo "Done! Run 'npm run test:integration' to execute tests."
