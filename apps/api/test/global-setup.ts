import { execSync } from 'node:child_process';

/** Applies every migration to the fresh schema chosen in vitest.config.e2e.ts. */
export default function setup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error('E2E_DATABASE_URL not set');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
