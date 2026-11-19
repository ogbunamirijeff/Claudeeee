import { Controller, Get, Module } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ACCESS_KEY } from '../../src/common/decorators/access.decorators';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { bearer, createHarness, Harness, login, uniquePhone } from './harness';

const ADMIN_PHONE = '+17135550100'; // created by the reference seed

describe('Role-based access control', () => {
  let h: Harness;
  let admin: Awaited<ReturnType<typeof login>>;
  let client: Awaited<ReturnType<typeof login>>;

  beforeAll(async () => {
    h = await createHarness();
    admin = await login(h, ADMIN_PHONE);
    client = await login(h, uniquePhone());
  });
  afterAll(() => h.close());

  it('every route in the app declares an access rule', async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    const discovery = mod.get(DiscoveryService);
    const scanner = mod.get(MetadataScanner);
    const undeclared: string[] = [];
    for (const wrapper of discovery.getControllers()) {
      const proto = wrapper.metatype?.prototype;
      if (!proto) continue;
      for (const method of scanner.getAllMethodNames(proto)) {
        const declared =
          Reflect.getMetadata(ACCESS_KEY, proto[method]) ??
          Reflect.getMetadata(ACCESS_KEY, wrapper.metatype!);
        if (!declared) undeclared.push(`${wrapper.name}.${method}`);
      }
    }
    expect(discovery.getControllers().length).toBeGreaterThanOrEqual(6);
    expect(undeclared).toEqual([]);
    await mod.close();
  });

  it('public routes work without a token', async () => {
    const trades = await h.http.get('/v1/catalog/trades').expect(200);
    expect(trades.body.map((t: { slug: string }) => t.slug)).toEqual([
      'plumbing',
      'electrical',
      'hvac',
    ]);
    const areas = await h.http.get('/v1/catalog/areas').expect(200);
    expect(areas.body.map((a: { slug: string }) => a.slug).sort()).toEqual([
      'heights',
      'katy',
      'midtown',
    ]);
    await h.http.get('/health').expect(200, { status: 'ok' });
  });

  it('protected routes need a token', async () => {
    await h.http.get('/v1/me').expect(401);
    await h.http.get('/v1/admin/users').expect(401);
  });

  it('clients cannot reach admin endpoints', async () => {
    const res = await h.http.get('/v1/admin/users').set(bearer(client.accessToken)).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
    await h.http
      .patch(`/v1/admin/users/${client.user.id}/roles`)
      .set(bearer(client.accessToken))
      .send({ roles: ['CLIENT', 'ADMIN'], reason: 'please' })
      .expect(403);
  });

  it('admins manage roles, and every change is audited with before/after', async () => {
    const res = await h.http
      .patch(`/v1/admin/users/${client.user.id}/roles`)
      .set(bearer(admin.accessToken))
      .send({ roles: ['CLIENT', 'ARTISAN'], reason: 'Onboarding as plumber' })
      .expect(200);
    expect(res.body.roles).toEqual(['CLIENT', 'ARTISAN']);

    const log = await h.prisma.auditLog.findFirstOrThrow({
      where: { entityId: client.user.id, action: 'user.roles.update' },
    });
    expect(log).toMatchObject({
      actorId: admin.user.id,
      actorRole: 'ADMIN',
      before: { roles: ['CLIENT'] },
      after: { roles: ['CLIENT', 'ARTISAN'], reason: 'Onboarding as plumber' },
    });
    expect(log.ipAddress).toBeTruthy();

    // Role change applies to the existing access token straight away (roles come from the DB).
    const me = await h.http.get('/v1/me').set(bearer(client.accessToken)).expect(200);
    expect(me.body.roles).toEqual(['CLIENT', 'ARTISAN']);

    const audit = await h.http
      .get(`/v1/admin/audit-logs?entityType=User&entityId=${client.user.id}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(audit.body.items.map((i: { action: string }) => i.action)).toContain(
      'user.roles.update',
    );
  });

  it('admins cannot remove their own admin role', async () => {
    const res = await h.http
      .patch(`/v1/admin/users/${admin.user.id}/roles`)
      .set(bearer(admin.accessToken))
      .send({ roles: ['CLIENT'], reason: 'oops' })
      .expect(400);
    expect(res.body.code).toBe('CANNOT_REMOVE_OWN_ADMIN');
  });

  it('suspension locks the user out immediately and is audited', async () => {
    const victim = await login(h, uniquePhone());
    await h.http
      .patch(`/v1/admin/users/${victim.user.id}/status`)
      .set(bearer(admin.accessToken))
      .send({ status: 'SUSPENDED', reason: 'Off-platform payment request' })
      .expect(200);

    const blocked = await h.http.get('/v1/me').set(bearer(victim.accessToken)).expect(403);
    expect(blocked.body.code).toBe('ACCOUNT_SUSPENDED');
    await h.http.post('/v1/auth/refresh').send({ refreshToken: victim.refreshToken }).expect(401);

    const phone = (await h.prisma.user.findUniqueOrThrow({ where: { id: victim.user.id } })).phone;
    await h.prisma.otpChallenge.updateMany({
      where: { phone },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const relogin = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: h.sms.lastCodeFor(phone), acceptTerms: true })
      .expect(403);
    expect(relogin.body.code).toBe('ACCOUNT_SUSPENDED');

    expect(
      await h.prisma.auditLog.count({
        where: { entityId: victim.user.id, action: 'user.status.update' },
      }),
    ).toBe(1);
  });

  it('lists and searches users for admins', async () => {
    const res = await h.http
      .get('/v1/admin/users?role=ADMIN')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(res.body.items.map((u: { id: string }) => u.id)).toContain(admin.user.id);
  });
});

describe('Routes without an access rule', () => {
  @Controller('undeclared')
  class UndeclaredController {
    @Get()
    get() {
      return 'should never be reachable';
    }
  }
  @Module({ imports: [AppModule, DiscoveryModule], controllers: [UndeclaredController] })
  class TestModule {}

  it('are denied by default', async () => {
    const mod = await Test.createTestingModule({ imports: [TestModule] }).compile();
    const app = mod.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    const res = await request(app.getHttpServer()).get('/v1/undeclared').expect(403);
    expect(res.body.code).toBe('ROUTE_ACCESS_UNDECLARED');
    await app.close();
  });
});
