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

/** Creates (or reuses) a SEALED artisan for a trade/area directly in the DB, then logs in. */
export async function sealedArtisan(
  h: Harness,
  opts: { trade: string; area: string; name: string; sealed?: boolean },
) {
  const phone = uniquePhone();
  const [trade, area] = await Promise.all([
    h.prisma.trade.findUniqueOrThrow({ where: { slug: opts.trade } }),
    h.prisma.serviceArea.findUniqueOrThrow({ where: { slug: opts.area } }),
  ]);
  const user = await h.prisma.user.create({
    data: { phone, name: opts.name, roles: ['CLIENT', 'ARTISAN'] },
  });
  const profile = await h.prisma.artisanProfile.create({
    data: {
      userId: user.id,
      displayName: opts.name,
      sealStatus: opts.sealed === false ? 'IN_PROGRESS' : 'SEALED',
      baseLat: area.lat + 0.01,
      baseLng: area.lng + 0.01,
      ratingAvg: 4.7,
      trades: { create: [{ tradeId: trade.id, isPrimary: true }] },
      serviceAreas: { create: [{ areaId: area.id }] },
    },
  });
  const session = await login(h, phone);
  return { ...session, phone, profileId: profile.id };
}

/** Requests an upload ticket and performs the direct upload against the local storage driver. */
export async function uploadPhoto(h: Harness, token: string, kind: string, jobId?: string) {
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  );
  const ticket = await h.http
    .post('/v1/files/uploads')
    .set(bearer(token))
    .send({ kind, mimeType: 'image/jpeg', sizeBytes: jpeg.length, ...(jobId ? { jobId } : {}) })
    .expect(201);
  const path = new URL(ticket.body.url as string).pathname;
  let req = h.http.post(path);
  for (const [k, v] of Object.entries(ticket.body.fields as Record<string, string>))
    req = req.field(k, v);
  await req.attach('file', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' }).expect(204);
  await h.http.post(`/v1/files/${ticket.body.fileId}/complete`).set(bearer(token)).expect(200);
  return ticket.body.fileId as string;
}

export function tomorrowLagos(): string {
  return new Date(Date.now() + 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}
