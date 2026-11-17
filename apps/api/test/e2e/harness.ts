import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { ENV } from '../../src/config/config.module';
import { loadEnv, type Env } from '../../src/config/env';
import {
  SMS_PROVIDER,
  type SmsMessage,
  type SmsProvider,
} from '../../src/modules/sms/sms.provider';
import { PrismaService } from '../../src/prisma/prisma.service';

export class CapturingSms implements SmsProvider {
  readonly name = 'capture';
  readonly sent: SmsMessage[] = [];
  send(msg: SmsMessage) {
    this.sent.push(msg);
    return Promise.resolve({ providerMessageId: null });
  }
  lastCodeFor(phone: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === phone);
    const code = msg?.body.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`No OTP sent to ${phone}`);
    return code;
  }
}

export interface Harness {
  app: INestApplication;
  http: ReturnType<typeof request>;
  sms: CapturingSms;
  prisma: PrismaService;
  close(): Promise<void>;
}

export async function createHarness(
  envOverrides: Partial<Record<keyof Env, string>> = {},
): Promise<Harness> {
  const sms = new CapturingSms();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, ...envOverrides }))
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  return {
    app,
    http: request(app.getHttpServer()),
    sms,
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}

const base = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
let counter = 0;
/** Unique valid Nigerian mobile per call, so tests don't collide on rate limits. */
export function uniquePhone(): string {
  counter += 1;
  if (counter > 99) throw new Error('uniquePhone exhausted for this file');
  return `+23490${base}${String(counter).padStart(2, '0')}`;
}

export async function login(h: Harness, phone: string) {
  // Re-used phones (e.g. the seeded admin) would hit the resend cooldown across runs.
  await h.prisma.otpChallenge.updateMany({
    where: { phone },
    data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
  });
  await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await h.http
    .post('/v1/auth/otp/verify')
    .send({ phone, code: h.sms.lastCodeFor(phone), acceptTerms: true })
    .expect(200);
  return res.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; roles: string[] };
    isNewUser: boolean;
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
