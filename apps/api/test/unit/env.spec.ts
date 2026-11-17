import { randomBytes } from 'node:crypto';
import { loadEnv } from '../../src/config/env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  OTP_PEPPER: 'y'.repeat(40),
  DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

describe('loadEnv', () => {
  it('accepts a minimal valid config with defaults', () => {
    const env = loadEnv(valid);
    expect(env.COMMISSION_BPS).toBe(1500);
    expect(env.SMS_PROVIDER).toBe('console');
  });

  it('rejects short secrets and bad keys, naming each problem', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'short', DATA_ENCRYPTION_KEY: 'abc' })).toThrow(
      /JWT_ACCESS_SECRET[\s\S]*DATA_ENCRYPTION_KEY/,
    );
  });

  it('refuses the console SMS provider in production', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/SMS_PROVIDER/);
  });

  it('requires a Termii key when Termii is selected', () => {
    expect(() => loadEnv({ ...valid, SMS_PROVIDER: 'termii' })).toThrow(/TERMII_API_KEY/);
  });
});
