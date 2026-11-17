import {
  bearer,
  createHarness,
  type Harness,
  login,
  sealedArtisan,
  tomorrowLagos,
  uniquePhone,
} from './harness';

/** Runs the real BullMQ job scheduler against Redis (REDIS_URL, default localhost:6379). */
describe('Offer expiry scheduler (BullMQ)', () => {
  let h: Harness;
  beforeAll(
    async () =>
      (h = await createHarness({ JOBS_WORKER_ENABLED: 'true', OFFER_SWEEP_INTERVAL_MS: '1000' })),
  );
  afterAll(() => h.close());

  it('expires an overdue offer without any manual call', async () => {
    const admin = await login(h, '+2348000000001');
    const client = await login(h, uniquePhone());
    const art = await sealedArtisan(h, { trade: 'plumbing', area: 'lekki', name: 'Sweeper Test' });
    const [trade, area] = await Promise.all([
      h.prisma.trade.findUniqueOrThrow({ where: { slug: 'plumbing' } }),
      h.prisma.serviceArea.findUniqueOrThrow({ where: { slug: 'lekki' } }),
    ]);
    const job = await h.http
      .post('/v1/jobs')
      .set(bearer(client.accessToken))
      .send({
        tradeId: trade.id,
        areaId: area.id,
        description: 'Kitchen sink leaking under the cabinet',
        addressLine: '14 Admiralty Way, Lekki',
        preferredDate: tomorrowLagos(),
        timeWindow: 'AFTERNOON',
      })
      .expect(201);
    await h.http
      .post(`/v1/admin/jobs/${job.body.id}/assign`)
      .set(bearer(admin.accessToken))
      .send({ artisanId: art.profileId })
      .expect(201);
    await h.prisma.assignment.updateMany({
      where: { jobId: job.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    // Sweeps run every second in this test; poll for the effect.
    const deadline = Date.now() + 15_000;
    let status = '';
    while (Date.now() < deadline) {
      status = (await h.prisma.assignment.findFirstOrThrow({ where: { jobId: job.body.id } }))
        .status;
      if (status === 'EXPIRED') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(status).toBe('EXPIRED');
  }, 30_000);
});
