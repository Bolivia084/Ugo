import { defineConfig } from 'vitest/config';

// Each run uses a brand new schema, created by applying the migrations. Nothing existing is reset or dropped.
const base = process.env.TEST_DATABASE_URL ?? 'postgresql://ugo:ugo_dev_password@localhost:5432/ugo_test';
const url = `${base}${base.includes('?') ? '&' : '?'}schema=e2e_${Date.now()}`;
process.env.E2E_DATABASE_URL = url;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: url,
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-test-secret',
      PAYSTACK_SECRET_KEY: 'sk_test_paystack',
      LOCAL_STORAGE_DIR: './storage-test',
      PUBLIC_API_URL: 'http://localhost:3999',
      CORS_ORIGINS: '',
    },
  },
});
