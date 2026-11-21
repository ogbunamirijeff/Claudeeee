import { FakeGateway } from '../../src/modules/payments/fake.gateway';
import { PAYMENT_GATEWAY } from '../../src/modules/payments/gateway';
import { LedgerService } from '../../src/modules/payments/ledger.service';
import { MaintenanceScheduler } from '../../src/modules/payments/maintenance.scheduler';
import { WebhooksService } from '../../src/modules/payments/webhooks.service';
import {
  bearer,
  createHarness,
  type Harness,
  login,
  sealedArtisan,
  tomorrowLocal,
  uniquePhone,
  uploadPhoto,
} from './harness';

type Session = Awaited<ReturnType<typeof login>>;
type Pro = Awaited<ReturnType<typeof sealedArtisan>>;

describe('Phase 3: payments, held funds, payouts, refunds, ledger', () => {
  let h: Harness;
  let admin: Session;
  let fake: FakeGateway;
  let webhooks: WebhooksService;
  let ids: { electrical: string; heights: string };

  beforeAll(async () => {
    h = await createHarness();
    admin = await login(h, '+17135550100');
    fake = h.app.get<FakeGateway>(PAYMENT_GATEWAY);
    webhooks = h.app.get(WebhooksService);
    const [t, a] = await Promise.all([
      h.prisma.trade.findUniqueOrThrow({ where: { slug: 'electrical' } }),
      h.prisma.serviceArea.findUniqueOrThrow({ where: { slug: 'heights' } }),
    ]);
    ids = { electrical: t.id, heights: a.id };
  });
  afterAll(() => h.close());

  // ── helpers ──
  const sendEvent = (
    type: string,
    object: Record<string, unknown>,
    id = `evt_${Math.random().toString(36).slice(2)}`,
  ) => {
    const payload = JSON.stringify({ id, type, data: { object } });
    return h.http
      .post('/v1/webhooks/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', webhooks.sign(payload))
      .send(payload);
  };
  const job = (id: string, token: string) =>
    h.http
      .get(`/v1/jobs/${id}`)
      .set(bearer(token))
      .expect(200)
      .then((r) => r.body);
  const ledgerOf = (jobId: string) =>
    h.http
      .get(`/v1/admin/jobs/${jobId}/ledger`)
      .set(bearer(admin.accessToken))
      .expect(200)
      .then((r) => r.body as { from: string; to: string; amountCents: number; memo: string }[]);

  /** A job with an approved quote, ready to pay. */
  async function approvedJob(
    items: {
      kind: 'LABOUR' | 'MATERIAL';
      description: string;
      quantity: number;
      unitPriceCents: number;
    }[],
    pro?: Pro,
  ) {
    const client = await login(h, uniquePhone());
    const art =
      pro ??
      (await sealedArtisan(h, { trade: 'electrical', area: 'heights', name: 'Payments Pro' }));
    const created = await h.http
      .post('/v1/jobs')
      .set(bearer(client.accessToken))
      .send({
        tradeId: ids.electrical,
        areaId: ids.heights,
        description: 'Water heater replacement needed',
        addressLine: '1234 Yale St, Houston, TX',
        postalCode: '77008',
        preferredDate: tomorrowLocal(),
        timeWindow: 'MORNING',
      })
      .expect(201);
    const jobId = created.body.id as string;
    await h.http
      .post(`/v1/admin/jobs/${jobId}/assign`)
      .set(bearer(admin.accessToken))
      .send({ artisanId: art.profileId })
      .expect(201);
    const a = await h.prisma.assignment.findFirstOrThrow({ where: { jobId } });
    await h.http.post(`/v1/assignments/${a.id}/accept`).set(bearer(art.accessToken)).expect(200);
    const q = await h.http
      .post(`/v1/jobs/${jobId}/quotes`)
      .set(bearer(art.accessToken))
      .send({ items })
      .expect(201);
    await h.http
      .post(`/v1/quotes/${q.body.quoteId}/approve`)
      .set(bearer(client.accessToken))
      .expect(200);
    return { jobId, client, art, quoteId: q.body.quoteId as string };
  }

  /** Pays through the (fake) Checkout and the real signed-webhook path. */
  async function pay(jobId: string, client: Session) {
    const co = await h.http
      .post(`/v1/jobs/${jobId}/checkout`)
      .set(bearer(client.accessToken))
      .expect(201);
    const payment = await h.prisma.payment.findUniqueOrThrow({ where: { id: co.body.paymentId } });
    const res = await sendEvent('checkout.session.completed', {
      id: payment.checkoutSessionId,
      object: 'checkout.session',
      payment_status: 'paid',
      amount_total: payment.amountCents,
      currency: 'usd',
      payment_intent: `pi_test_${payment.id}`,
    }).expect(200);
    return { payment, checkoutUrl: co.body.url as string, eventResponse: res.body };
  }

  async function enablePayouts(pro: Pro) {
    const link = await h.http
      .post('/v1/artisan/payouts/onboarding')
      .set(bearer(pro.accessToken))
      .expect(200);
    const accountId = new URL(link.body.url as string).searchParams.get('account')!;
    await sendEvent('account.updated', {
      id: accountId,
      object: 'account',
      payouts_enabled: true,
    }).expect(200);
  }

  const WATER_HEATER = [
    {
      kind: 'LABOUR' as const,
      description: 'Replace 40-gal water heater',
      quantity: 1,
      unitPriceCents: 45_000,
    },
    {
      kind: 'MATERIAL' as const,
      description: '40-gal gas water heater',
      quantity: 1,
      unitPriceCents: 78_050,
    },
  ];

  describe('full happy path', () => {
    let ctx: Awaited<ReturnType<typeof approvedJob>>;

    beforeAll(async () => {
      ctx = await approvedJob(WATER_HEATER);
    });

    it('client pays via Checkout; a signed webhook holds the funds and marks the job PAID', async () => {
      const before = await job(ctx.jobId, ctx.client.accessToken);
      expect(before.canPay).toBe(true);
      const { payment, checkoutUrl } = await pay(ctx.jobId, ctx.client);
      expect(checkoutUrl).toContain('/dev/checkout?session=cs_test_fake_');

      const after = await job(ctx.jobId, ctx.client.accessToken);
      expect(after).toMatchObject({
        status: 'PAID',
        canPay: false,
        payment: { status: 'HELD', amountCents: 123_050 },
      });
      expect(after.artisan.phone).not.toMatch(/•/); // contact details revealed once paid

      const p = await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(p).toMatchObject({
        status: 'HELD',
        feesCents: Math.round(123_050 * 0.029) + 30,
        stripePaymentIntentId: `pi_test_${payment.id}`,
      });
      expect(await ledgerOf(ctx.jobId)).toEqual([
        expect.objectContaining({ from: 'PAYMENT_INFLOW', to: 'ESCROW', amountCents: 123_050 }),
        expect.objectContaining({
          from: 'PLATFORM_COMMISSION',
          to: 'PROCESSING_FEES',
          amountCents: 3_598,
        }),
      ]);
    });

    it('a duplicate webhook delivery changes nothing', async () => {
      const p = await h.prisma.payment.findFirstOrThrow({
        where: { jobId: ctx.jobId, status: 'HELD' },
      });
      const event = {
        id: p.checkoutSessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: p.amountCents,
        currency: 'usd',
        payment_intent: `pi_test_${p.id}`,
      };
      await sendEvent('checkout.session.completed', event, 'evt_dup_1').expect(200);
      const again = await sendEvent('checkout.session.completed', event, 'evt_dup_1').expect(200);
      expect(again.body).toEqual({ received: true, duplicate: true });
      expect(await ledgerOf(ctx.jobId)).toHaveLength(2);
    });

    it('the pro must upload a before-photo to start; the advance (capped at $500) waits for payout setup', async () => {
      const blocked = await h.http
        .post(`/v1/jobs/${ctx.jobId}/start`)
        .set(bearer(ctx.art.accessToken))
        .expect(422);
      expect(blocked.body.reason ?? blocked.body.message).toMatch(/before-photo/);
      await h.http
        .post(`/v1/jobs/${ctx.jobId}/start`)
        .set(bearer(ctx.client.accessToken))
        .expect(403); // clients can't start work

      await uploadPhoto(h, ctx.art.accessToken, 'JOB_PHOTO_BEFORE', ctx.jobId);
      const started = await h.http
        .post(`/v1/jobs/${ctx.jobId}/start`)
        .set(bearer(ctx.art.accessToken))
        .expect(200);
      expect(started.body.materialsAdvancePayoutId).toEqual(expect.any(String));

      const payout = await h.prisma.payout.findUniqueOrThrow({
        where: { id: started.body.materialsAdvancePayoutId },
      });
      expect(payout).toMatchObject({
        amountCents: 50_000,
        trigger: 'MATERIALS_ADVANCE',
        status: 'PENDING',
        failureReason: expect.stringMatching(/payout setup/),
      });
      expect((await job(ctx.jobId, ctx.client.accessToken)).status).toBe('IN_PROGRESS');
      expect(
        (
          await h.prisma.payment.findFirstOrThrow({
            where: { jobId: ctx.jobId, status: { not: 'ABANDONED' } },
          })
        ).status,
      ).toBe('PARTIALLY_RELEASED');
    });

    it('once the pro finishes Stripe onboarding, pending payouts are sent (idempotently)', async () => {
      await enablePayouts(ctx.art);
      const payout = await h.prisma.payout.findFirstOrThrow({
        where: { jobId: ctx.jobId, trigger: 'MATERIALS_ADVANCE' },
      });
      expect(payout.status).toBe('SUCCEEDED');
      expect(
        fake.transfers.filter((t) => t.idempotencyKey === payout.transferReference),
      ).toHaveLength(1);
      const status = await h.http
        .get('/v1/artisan/payouts')
        .set(bearer(ctx.art.accessToken))
        .expect(200);
      expect(status.body).toMatchObject({ accountConnected: true, payoutsEnabled: true });
    });

    it('marking work done needs after-photos and the materials receipt', async () => {
      const noPhoto = await h.http
        .post(`/v1/jobs/${ctx.jobId}/submit-work`)
        .set(bearer(ctx.art.accessToken))
        .expect(422);
      expect(noPhoto.body.message).toMatch(/after-photo/);
      await uploadPhoto(h, ctx.art.accessToken, 'JOB_PHOTO_AFTER', ctx.jobId);
      const noReceipt = await h.http
        .post(`/v1/jobs/${ctx.jobId}/submit-work`)
        .set(bearer(ctx.art.accessToken))
        .expect(422);
      expect(noReceipt.body.message).toMatch(/receipt/);
      await uploadPhoto(h, ctx.art.accessToken, 'MATERIALS_RECEIPT', ctx.jobId);
      const done = await h.http
        .post(`/v1/jobs/${ctx.jobId}/submit-work`)
        .set(bearer(ctx.art.accessToken))
        .expect(200);
      expect(Date.parse(done.body.autoReleaseAt) - Date.now()).toBeGreaterThan(47.9 * 3_600_000);
      const v = await job(ctx.jobId, ctx.client.accessToken);
      expect(v.status).toBe('WORK_SUBMITTED');
      expect(v.actions).toContain('confirmCompletion');
    });

    it('client confirms → the rest is released, commission booked, escrow empty, stats updated', async () => {
      await h.http
        .post(`/v1/jobs/${ctx.jobId}/confirm`)
        .set(bearer(ctx.art.accessToken))
        .expect(404); // not their job as client
      await h.http
        .post(`/v1/jobs/${ctx.jobId}/confirm`)
        .set(bearer(ctx.client.accessToken))
        .expect(200);
      const v = await job(ctx.jobId, ctx.client.accessToken);
      expect(v).toMatchObject({ status: 'COMPLETED', payment: { status: 'RELEASED' } });
      expect(Date.parse(v.guaranteeExpiresAt) - Date.parse(v.completedAt)).toBe(7 * 86_400_000);

      // $1,230.50 total: commission 15% = $184.58 (all from labor); advance $500; completion $545.92
      const ledger = await ledgerOf(ctx.jobId);
      expect(ledger.map((l) => [l.from, l.to, l.amountCents])).toEqual([
        ['PAYMENT_INFLOW', 'ESCROW', 123_050],
        ['PLATFORM_COMMISSION', 'PROCESSING_FEES', 3_598],
        ['ESCROW', 'ARTISAN_PAYABLE', 50_000],
        ['ARTISAN_PAYABLE', 'ARTISAN_PAID_OUT', 50_000],
        ['ESCROW', 'ARTISAN_PAYABLE', 54_592],
        ['ESCROW', 'PLATFORM_COMMISSION', 18_458],
        ['ARTISAN_PAYABLE', 'ARTISAN_PAID_OUT', 54_592],
      ]);
      const p = await h.prisma.payment.findFirstOrThrow({
        where: { jobId: ctx.jobId, status: 'RELEASED' },
      });
      const totals = await h.prisma.$transaction((tx) => h.app.get(LedgerService).totals(tx, p.id));
      expect(totals).toEqual({
        capturedCents: 123_050,
        releasedCents: 123_050,
        refundedCents: 0,
        escrowCents: 0,
      });
      expect(
        await h.prisma.artisanProfile.findUniqueOrThrow({ where: { id: ctx.art.profileId } }),
      ).toMatchObject({ jobsCompleted: 1, completionRate: 1 });

      const adminList = await h.http
        .get('/v1/admin/payments')
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(adminList.body.find((x: { jobId: string }) => x.jobId === ctx.jobId)).toMatchObject({
        heldCents: 0,
        commissionCents: 18_458,
        paidOutCents: 104_592,
        awaitingPayoutCents: 0,
      });
    });
  });

  it('auto-releases 48h after work is submitted when the client does nothing', async () => {
    const pro = await sealedArtisan(h, {
      trade: 'electrical',
      area: 'heights',
      name: 'Auto Release Pro',
    });
    await enablePayouts(pro);
    const ctx = await approvedJob(
      [{ kind: 'LABOUR', description: 'Replace ceiling fan', quantity: 1, unitPriceCents: 20_000 }],
      pro,
    );
    await pay(ctx.jobId, ctx.client);
    await uploadPhoto(h, pro.accessToken, 'JOB_PHOTO_BEFORE', ctx.jobId);
    const started = await h.http
      .post(`/v1/jobs/${ctx.jobId}/start`)
      .set(bearer(pro.accessToken))
      .expect(200);
    expect(started.body.materialsAdvancePayoutId).toBeNull(); // no materials, no advance
    await uploadPhoto(h, pro.accessToken, 'JOB_PHOTO_AFTER', ctx.jobId);
    await h.http.post(`/v1/jobs/${ctx.jobId}/submit-work`).set(bearer(pro.accessToken)).expect(200); // no receipt needed

    const scheduler = h.app.get(MaintenanceScheduler);
    expect((await scheduler.sweep()).released).toBe(0); // not yet due
    await h.prisma.jobRequest.update({
      where: { id: ctx.jobId },
      data: { autoReleaseAt: new Date(Date.now() - 1000) },
    });
    expect((await scheduler.sweep()).released).toBeGreaterThanOrEqual(1);

    const v = await job(ctx.jobId, ctx.client.accessToken);
    expect(v.status).toBe('COMPLETED');
    expect(v.timeline.at(-1).note).toMatch(/auto-released/);
    const payout = await h.prisma.payout.findFirstOrThrow({ where: { jobId: ctx.jobId } });
    expect(payout).toMatchObject({
      trigger: 'AUTO_RELEASE',
      amountCents: 17_000,
      status: 'SUCCEEDED',
    });
  });

  it('retries a failed transfer without paying twice', async () => {
    const pro = await sealedArtisan(h, { trade: 'electrical', area: 'heights', name: 'Retry Pro' });
    await enablePayouts(pro);
    const ctx = await approvedJob(WATER_HEATER, pro);
    await pay(ctx.jobId, ctx.client);
    await uploadPhoto(h, pro.accessToken, 'JOB_PHOTO_BEFORE', ctx.jobId);
    fake.failTransfers = 1;
    const started = await h.http
      .post(`/v1/jobs/${ctx.jobId}/start`)
      .set(bearer(pro.accessToken))
      .expect(200);
    const failed = await h.prisma.payout.findUniqueOrThrow({
      where: { id: started.body.materialsAdvancePayoutId },
    });
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 1 });
    // Money stays owed to the pro (payable), not lost.
    expect((await ledgerOf(ctx.jobId)).filter((l) => l.to === 'ARTISAN_PAID_OUT')).toHaveLength(0);

    await h.app.get(MaintenanceScheduler).sweep();
    const ok = await h.prisma.payout.findUniqueOrThrow({ where: { id: failed.id } });
    expect(ok).toMatchObject({ status: 'SUCCEEDED', attempts: 2 });
    expect(fake.transfers.filter((t) => t.idempotencyKey === ok.transferReference)).toHaveLength(1);
  });

  describe('refunds', () => {
    it('admin refunds a paid job before work starts; audited', async () => {
      const ctx = await approvedJob(WATER_HEATER);
      await pay(ctx.jobId, ctx.client);
      await h.http
        .post(`/v1/admin/jobs/${ctx.jobId}/refund`)
        .set(bearer(ctx.client.accessToken))
        .send({ reason: 'nope' })
        .expect(403);
      const r = await h.http
        .post(`/v1/admin/jobs/${ctx.jobId}/refund`)
        .set(bearer(admin.accessToken))
        .send({ reason: 'Pro unavailable; client asked to cancel' })
        .expect(200);
      expect(r.body.amountCents).toBe(123_050);
      const v = await job(ctx.jobId, ctx.client.accessToken);
      expect(v).toMatchObject({ status: 'REFUNDED', payment: { status: 'REFUNDED' } });
      const p = await h.prisma.payment.findFirstOrThrow({
        where: { jobId: ctx.jobId, status: 'REFUNDED' },
      });
      expect(p).toMatchObject({ refundedCents: 123_050, releasedCents: 0 });
      expect(await h.prisma.refund.findFirstOrThrow({ where: { paymentId: p.id } })).toMatchObject({
        status: 'SUCCEEDED',
        stripeRefundId: expect.stringMatching(/^re_fake_/),
      });
      expect(
        await h.prisma.auditLog.count({ where: { action: 'payment.refund', entityId: ctx.jobId } }),
      ).toBe(1);
    });

    it('a refund the processor rejects puts the money back in escrow', async () => {
      const ctx = await approvedJob(WATER_HEATER);
      await pay(ctx.jobId, ctx.client);
      fake.refundOutcome = 'failed';
      try {
        await h.http
          .post(`/v1/admin/jobs/${ctx.jobId}/refund`)
          .set(bearer(admin.accessToken))
          .send({ reason: 'Testing failure path' })
          .expect(200);
      } finally {
        fake.refundOutcome = 'succeeded';
      }
      const p = await h.prisma.payment.findFirstOrThrow({
        where: { jobId: ctx.jobId, status: { notIn: ['ABANDONED', 'FAILED'] } },
      });
      expect(p.refundedCents).toBe(0);
      const totals = await h.prisma.$transaction((tx) => h.app.get(LedgerService).totals(tx, p.id));
      expect(totals.escrowCents).toBe(123_050);
      expect(await h.prisma.refund.findFirstOrThrow({ where: { paymentId: p.id } })).toMatchObject({
        status: 'FAILED',
      });
      expect((await ledgerOf(ctx.jobId)).at(-1)).toMatchObject({
        from: 'CLIENT_REFUNDED',
        to: 'ESCROW',
        amountCents: 123_050,
      });
    });

    it('money that arrives after the client cancelled is refunded automatically', async () => {
      const ctx = await approvedJob(WATER_HEATER);
      const co = await h.http
        .post(`/v1/jobs/${ctx.jobId}/checkout`)
        .set(bearer(ctx.client.accessToken))
        .expect(201);
      await h.http
        .post(`/v1/jobs/${ctx.jobId}/cancel`)
        .set(bearer(ctx.client.accessToken))
        .send({ reason: 'Changed my mind' })
        .expect(200);
      const payment = await h.prisma.payment.findUniqueOrThrow({
        where: { id: co.body.paymentId },
      });
      await sendEvent('checkout.session.completed', {
        id: payment.checkoutSessionId,
        payment_status: 'paid',
        amount_total: payment.amountCents,
        currency: 'usd',
        payment_intent: `pi_late_${payment.id}`,
      }).expect(200);
      const p = await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(p).toMatchObject({ status: 'REFUNDED', refundedCents: 123_050 });
      expect((await job(ctx.jobId, ctx.client.accessToken)).status).toBe('CANCELLED');
    });
  });

  describe('guards', () => {
    it('rejects webhooks with a bad or missing signature', async () => {
      const payload = JSON.stringify({
        id: 'evt_x',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_x' } },
      });
      await h.http
        .post('/v1/webhooks/stripe')
        .set('content-type', 'application/json')
        .send(payload)
        .expect(400);
      await h.http
        .post('/v1/webhooks/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', 't=1,v1=deadbeef')
        .send(payload)
        .expect(400);
      // Valid signature for a different body
      const sig = webhooks.sign(payload);
      await h.http
        .post('/v1/webhooks/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', sig)
        .send(payload.replace('cs_x', 'cs_y'))
        .expect(400);
    });

    it('refuses an amount that does not match the quote (Stripe will retry; ops alerted)', async () => {
      const ctx = await approvedJob(WATER_HEATER);
      const co = await h.http
        .post(`/v1/jobs/${ctx.jobId}/checkout`)
        .set(bearer(ctx.client.accessToken))
        .expect(201);
      const p = await h.prisma.payment.findUniqueOrThrow({ where: { id: co.body.paymentId } });
      await sendEvent('checkout.session.completed', {
        id: p.checkoutSessionId,
        payment_status: 'paid',
        amount_total: 100,
        currency: 'usd',
        payment_intent: 'pi_bad',
      }).expect(500);
      expect((await h.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
        'INITIALIZED',
      );
      expect(
        await h.prisma.auditLog.count({
          where: { action: 'payment.amount_mismatch', entityId: p.id },
        }),
      ).toBe(1);
    });

    it('cannot pay while Jiko reviews a materials-heavy quote, and cannot pay twice', async () => {
      const heavy = await approvedJob([
        { kind: 'LABOUR', description: 'Install compressor', quantity: 1, unitPriceCents: 2_000 },
        {
          kind: 'MATERIAL',
          description: '3-ton AC compressor',
          quantity: 1,
          unitPriceCents: 200_000,
        },
      ]);
      const blocked = await h.http
        .post(`/v1/jobs/${heavy.jobId}/checkout`)
        .set(bearer(heavy.client.accessToken))
        .expect(409);
      expect(blocked.body.code).toBe('QUOTE_UNDER_REVIEW');
      expect((await job(heavy.jobId, heavy.client.accessToken)).canPay).toBe(false);

      const ctx = await approvedJob(WATER_HEATER);
      await pay(ctx.jobId, ctx.client);
      const twice = await h.http
        .post(`/v1/jobs/${ctx.jobId}/checkout`)
        .set(bearer(ctx.client.accessToken))
        .expect(409);
      expect(twice.body.code).toBe('NOT_PAYABLE');
    });

    it('a second checkout abandons the first unpaid session (one live payment per job)', async () => {
      const ctx = await approvedJob(WATER_HEATER);
      const a = await h.http
        .post(`/v1/jobs/${ctx.jobId}/checkout`)
        .set(bearer(ctx.client.accessToken))
        .expect(201);
      const b = await h.http
        .post(`/v1/jobs/${ctx.jobId}/checkout`)
        .set(bearer(ctx.client.accessToken))
        .expect(201);
      expect(
        (await h.prisma.payment.findUniqueOrThrow({ where: { id: a.body.paymentId } })).status,
      ).toBe('ABANDONED');
      expect(
        (await h.prisma.payment.findUniqueOrThrow({ where: { id: b.body.paymentId } })).status,
      ).toBe('INITIALIZED');
    });

    it('dev checkout simulator works without a session (like Stripe’s page) and only with the fake provider', async () => {
      const ctx = await approvedJob(WATER_HEATER);
      const co = await h.http
        .post(`/v1/jobs/${ctx.jobId}/checkout`)
        .set(bearer(ctx.client.accessToken))
        .expect(201);
      const session = new URL(co.body.url as string).searchParams.get('session');
      await h.http
        .post('/v1/dev/payments/checkout/complete')
        .send({ sessionId: 'cs_test_fake_doesnotexist' })
        .expect(404);
      await h.http
        .post('/v1/dev/payments/checkout/complete')
        .send({ sessionId: session })
        .expect(200);
      expect((await job(ctx.jobId, ctx.client.accessToken)).status).toBe('PAID');

      const live = await createHarness({
        PAYMENTS_PROVIDER: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_not_used_offline',
      });
      try {
        await live.http
          .post('/v1/dev/payments/checkout/complete')
          .send({ sessionId: session })
          .expect(404);
      } finally {
        await live.close();
      }
    });
  });

  it('Payment.releasedCents / refundedCents always equal the ledger-derived values', async () => {
    const payments = await h.prisma.payment.findMany();
    expect(payments.length).toBeGreaterThan(5);
    const ledger = h.app.get(LedgerService);
    for (const p of payments) {
      const t = await h.prisma.$transaction((tx) => ledger.totals(tx, p.id));
      expect({ id: p.id, released: p.releasedCents, refunded: p.refundedCents }).toEqual({
        id: p.id,
        released: t.releasedCents,
        refunded: t.refundedCents,
      });
      expect(t.escrowCents).toBeGreaterThanOrEqual(0);
    }
  });
});
