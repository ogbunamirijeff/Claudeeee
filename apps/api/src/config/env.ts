import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: bool.default('false'),

    // Auth
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    OTP_PEPPER: z.string().min(32),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
    OTP_MAX_PER_PHONE_PER_HOUR: z.coerce.number().int().positive().default(5),
    OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),

    // Field-level encryption (bank account numbers). Previous keys allow rotation:
    // DATA_ENCRYPTION_PREVIOUS_KEYS="k1:<base64>,k0:<base64>"
    DATA_ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[a-z0-9]{1,16}$/)
      .default('k1'),
    DATA_ENCRYPTION_KEY: base64Key32,
    DATA_ENCRYPTION_PREVIOUS_KEYS: z.string().default(''),

    // SMS
    SMS_PROVIDER: z.enum(['twilio', 'console']).default('console'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    /** A2P 10DLC / toll-free registered sender: either a Messaging Service SID or an E.164 number. */
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),

    // Payments (Phase 3): Stripe Connect, separate charges and transfers.
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Market
    MARKET_TIMEZONE: z.string().default('America/Chicago'), // Houston

    // File storage. "local" stores files on disk behind HMAC-signed API URLs (dev/test only).
    PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
    STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('.storage'),
    S3_ENDPOINT: z.string().url().optional(), // e.g. Cloudflare R2 / MinIO; omit for AWS
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default('false'),
    S3_BUCKET_JOBS: z.string().default('jiko-jobs'),
    S3_BUCKET_PRIVATE: z.string().default('jiko-private'), // ID docs + verification evidence
    SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

    // Background jobs (BullMQ). Disable in tests or on web-only instances.
    JOBS_WORKER_ENABLED: bool.default('true'),
    OFFER_SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    /** Redis key prefix for BullMQ queues (isolates environments sharing one Redis). */
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-z0-9:_-]+$/)
      .default('jiko'),

    // Business rules
    COMMISSION_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
    MATERIALS_ADVANCE_CAP_CENTS: z.coerce.number().int().min(0).max(2_147_483_647).default(50_000), // $500
    MATERIALS_REVIEW_THRESHOLD_BPS: z.coerce.number().int().min(0).max(10_000).default(7000), // 70%
  })
  .superRefine((env, ctx) => {
    if (env.SMS_PROVIDER === 'twilio') {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        ctx.addIssue({
          code: 'custom',
          path: ['TWILIO_ACCOUNT_SID'],
          message: 'Twilio credentials are required when SMS_PROVIDER=twilio',
        });
      }
      if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_NUMBER) {
        ctx.addIssue({
          code: 'custom',
          path: ['TWILIO_MESSAGING_SERVICE_SID'],
          message: 'Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER',
        });
      }
    }
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'local storage is not allowed in production',
      });
    }
    if (env.STORAGE_DRIVER === 's3' && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'S3 credentials are required when STORAGE_DRIVER=s3',
      });
    }
    if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'console provider is not allowed in production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
