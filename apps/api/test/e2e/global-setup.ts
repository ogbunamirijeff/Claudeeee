import { execSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Applies pending migrations to the test database and loads reference data. Non-destructive:
 * tests create their own uniquely-keyed rows instead of relying on an empty database.
 */
export default function globalSetup() {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ??
      'postgresql://jiko:jiko@localhost:5432/jiko_test?schema=public',
    SEED_ADMIN_PHONE: '+2348000000001',
  };
  const cwd = join(__dirname, '..', '..');
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed/reference.ts', { cwd, env, stdio: 'pipe' });
}
