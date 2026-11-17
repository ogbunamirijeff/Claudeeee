// Loaded before every e2e test file. Uses a separate database (jiko_test).
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://jiko:jiko@localhost:5432/jiko_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret-'.padEnd(48, 'x');
process.env.OTP_PEPPER = 'test-otp-pepper-'.padEnd(48, 'y');
process.env.DATA_ENCRYPTION_KEY =
  process.env.DATA_ENCRYPTION_KEY_TEST ?? randomBytes(32).toString('base64');
process.env.SMS_PROVIDER = 'console';
process.env.OTP_MAX_PER_IP_PER_HOUR = '100000'; // all tests share 127.0.0.1; IP limit has its own test
process.env.SEED_ADMIN_PHONE = '+2348000000001';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = join(tmpdir(), 'jiko-e2e-storage');
process.env.JOBS_WORKER_ENABLED = 'false';
process.env.PUBLIC_API_URL = 'http://jiko.test';
