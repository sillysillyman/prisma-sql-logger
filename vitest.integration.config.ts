import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    // Run integration test files sequentially to avoid races on the shared DB
    fileParallelism: false,
  },
});
