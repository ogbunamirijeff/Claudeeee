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
    DATA_ENCRYPTION_KEY_ID: z.string().regex(/^[a-z0-9]{1,16}$/).default('k1'),
    DATA_ENCRYPTION_KEY: base64Key32,
    DATA_ENCRYPTION_PREVIOUS_KEYS: z.string().default(''),

    // SMS
    SMS_PROVIDER: z.enum(['termii', 'console']).default('console'),
    TERMII_BASE_URL: z.string().url().default('https://api.ng.termii.com'),
    TERMII_API_KEY: z.string().optional(),
    TERMII_SENDER_ID: z.string().default('Jiko'),
    TERMII_CHANNEL: z.enum(['dnd', 'generic', 'whatsapp']).default('dnd'),

    // Business rules
    COMMISSION_BPS: z.coerce.number().int().min(0).max(10_000).default(1500),
  })
  .superRefine((env, ctx) => {
    if (env.SMS_PROVIDER === 'termii' && !env.TERMII_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['TERMII_API_KEY'], message: 'required when SMS_PROVIDER=termii' });
    }
    if (env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'console provider is not allowed in production' });
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
