import { CONSENT_VERSION } from '@jiko/shared';
import { bearer, createHarness, Harness, login, uniquePhone } from './harness';

describe('Auth: phone + OTP', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness()));
  afterAll(() => h.close());

  it('signs up a new client end to end', async () => {
    const phone = uniquePhone();
    const local = `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`; // users type "(713) 555-0123"

    const req = await h.http.post('/v1/auth/otp/request').send({ phone: local }).expect(200);
    expect(req.body.resendAfterSeconds).toBe(60);
    expect(h.sms.sent.at(-1)).toMatchObject({ to: phone, transactional: true });
    const code = h.sms.lastCodeFor(phone);

    // Code is never stored in plain text.
    const challenge = await h.prisma.otpChallenge.findFirstOrThrow({ where: { phone } });
    expect(challenge.codeHash).not.toContain(code);

    // First sign-up requires consent (Terms, Privacy, TCPA texts); missing it doesn't burn an attempt.
    const noConsent = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone: local, code })
      .expect(400);
    expect(noConsent.body.code).toBe('CONSENT_REQUIRED');

    const wrong = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: code === '000000' ? '111111' : '000000', acceptTerms: true })
      .expect(400);
    expect(wrong.body).toMatchObject({ code: 'OTP_INVALID', details: { attemptsRemaining: 4 } });

    const ok = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code, acceptTerms: true })
      .expect(200);
    expect(ok.body).toMatchObject({ isNewUser: true, user: { phone, roles: ['CLIENT'] } });
    expect(ok.body.accessToken).toEqual(expect.any(String));
    expect(ok.body.refreshToken).toEqual(expect.any(String));

    const user = await h.prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(user.consentVersion).toBe(CONSENT_VERSION);
    expect(
      await h.prisma.auditLog.count({ where: { entityId: user.id, action: 'user.signup' } }),
    ).toBe(1);

    const me = await h.http.get('/v1/me').set(bearer(ok.body.accessToken)).expect(200);
    expect(me.body).toMatchObject({ id: user.id, phone, roles: ['CLIENT'] });

    // A code works once.
    const reuse = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code, acceptTerms: true })
      .expect(400);
    expect(reuse.body.code).toBe('OTP_EXPIRED');
  });

  it('logs an existing user in without creating a duplicate', async () => {
    const phone = uniquePhone();
    const first = await login(h, phone);
    await h.prisma.otpChallenge.updateMany({
      where: { phone },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const second = await login(h, phone);
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('rejects invalid phone numbers', async () => {
    const res = await h.http.post('/v1/auth/otp/request').send({ phone: '01-2345678' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('locks a code after 5 wrong attempts, even if the right code follows', async () => {
    const phone = uniquePhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const code = h.sms.lastCodeFor(phone);
    const bad = code === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) {
      await h.http
        .post('/v1/auth/otp/verify')
        .send({ phone, code: bad, acceptTerms: true })
        .expect(400);
    }
    const locked = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code, acceptTerms: true })
      .expect(429);
    expect(locked.body.code).toBe('OTP_LOCKED');
  });

  it('cannot exceed the attempt limit with parallel guesses', async () => {
    const phone = uniquePhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const code = h.sms.lastCodeFor(phone);
    const guesses = Array.from({ length: 20 }, (_, i) => String(i).padStart(6, '0')).filter(
      (g) => g !== code,
    );
    await Promise.all(
      guesses.map((g) =>
        h.http.post('/v1/auth/otp/verify').send({ phone, code: g, acceptTerms: true }),
      ),
    );
    const c = await h.prisma.otpChallenge.findFirstOrThrow({ where: { phone } });
    expect(c.attempts).toBe(5);
  });

  it('expires codes', async () => {
    const phone = uniquePhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    await h.prisma.otpChallenge.updateMany({
      where: { phone },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: h.sms.lastCodeFor(phone), acceptTerms: true })
      .expect(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('enforces the resend cooldown and the hourly per-phone limit', async () => {
    const phone = uniquePhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const again = await h.http.post('/v1/auth/otp/request').send({ phone }).expect(429);
    expect(again.body.code).toBe('OTP_COOLDOWN');

    // Simulate 5 requests earlier this hour, outside the cooldown.
    await h.prisma.otpChallenge.updateMany({
      where: { phone },
      data: { createdAt: new Date(Date.now() - 600_000) },
    });
    await h.prisma.otpChallenge.createMany({
      data: Array.from({ length: 4 }, () => ({
        phone,
        codeHash: 'x',
        expiresAt: new Date(),
        createdAt: new Date(Date.now() - 600_000),
      })),
    });
    const limited = await h.http.post('/v1/auth/otp/request').send({ phone }).expect(429);
    expect(limited.body.code).toBe('OTP_RATE_LIMITED');
  });

  it('a newer code replaces an older unused one', async () => {
    const phone = uniquePhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const oldCode = h.sms.lastCodeFor(phone);
    await h.prisma.otpChallenge.updateMany({
      where: { phone },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const newCode = h.sms.lastCodeFor(phone);
    if (oldCode !== newCode) {
      const res = await h.http
        .post('/v1/auth/otp/verify')
        .send({ phone, code: oldCode, acceptTerms: true })
        .expect(400);
      expect(res.body.code).toBe('OTP_INVALID');
    }
    await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: newCode, acceptTerms: true })
      .expect(200);
  });

  describe('refresh tokens', () => {
    it('rotates, and re-use of a rotated token revokes the whole family', async () => {
      const { refreshToken: rt1, user } = await login(h, uniquePhone());

      const r2 = await h.http.post('/v1/auth/refresh').send({ refreshToken: rt1 }).expect(200);
      const rt2 = r2.body.refreshToken as string;
      expect(rt2).not.toBe(rt1);
      await h.http.get('/v1/me').set(bearer(r2.body.accessToken)).expect(200);

      // Attacker replays the old token → family revoked, legitimate rt2 dies too.
      const replay = await h.http.post('/v1/auth/refresh').send({ refreshToken: rt1 }).expect(401);
      expect(replay.body.code).toBe('REFRESH_INVALID');
      await h.http.post('/v1/auth/refresh').send({ refreshToken: rt2 }).expect(401);
      expect(
        await h.prisma.auditLog.count({
          where: { entityId: user.id, action: 'auth.refresh_token_reuse' },
        }),
      ).toBe(1);
    });

    it('logout revokes the refresh token', async () => {
      const { refreshToken } = await login(h, uniquePhone());
      await h.http.post('/v1/auth/logout').send({ refreshToken }).expect(204);
      await h.http.post('/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('rejects expired refresh tokens', async () => {
      const { refreshToken, user } = await login(h, uniquePhone());
      await h.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      await h.http.post('/v1/auth/refresh').send({ refreshToken }).expect(401);
    });
  });

  it('updates the profile', async () => {
    const { accessToken } = await login(h, uniquePhone());
    const area = await h.prisma.serviceArea.findFirstOrThrow({ where: { slug: 'heights' } });
    const res = await h.http
      .patch('/v1/me')
      .set(bearer(accessToken))
      .send({ name: 'Amaka Obi', defaultAreaId: area.id })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Amaka Obi', defaultAreaId: area.id });
    await h.http
      .patch('/v1/me')
      .set(bearer(accessToken))
      .send({ defaultAreaId: 'nope' })
      .expect(400);
    // Users can't grant themselves roles through the profile endpoint.
    const sneaky = await h.http
      .patch('/v1/me')
      .set(bearer(accessToken))
      .send({ roles: ['ADMIN'] })
      .expect(200);
    expect(sneaky.body.roles).toEqual(['CLIENT']);
  });
});

describe('Auth: per-IP OTP limit', () => {
  let h: Harness;
  beforeAll(async () => (h = await createHarness({ OTP_MAX_PER_IP_PER_HOUR: '3' })));
  afterAll(() => h.close());

  it('stops one IP from requesting codes for many numbers', async () => {
    // Earlier tests in this run used the same IP, so it may already be over the limit.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (await h.http.post('/v1/auth/otp/request').send({ phone: uniquePhone() })).status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
