import { offerExpiresAt } from '@jiko/shared';
import { AssignmentsService } from '../../src/modules/assignments/assignments.service';
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

describe('Phase 2: request → assignment → quote → approval', () => {
  let h: Harness;
  let admin: Session;
  let client: Session;
  let ids: { electrical: string; heights: string; katy: string };

  beforeAll(async () => {
    h = await createHarness();
    admin = await login(h, '+17135550100');
    client = await login(h, uniquePhone());
    const [electrical, heights, katy] = await Promise.all([
      h.prisma.trade.findUniqueOrThrow({ where: { slug: 'electrical' } }),
      h.prisma.serviceArea.findUniqueOrThrow({ where: { slug: 'heights' } }),
      h.prisma.serviceArea.findUniqueOrThrow({ where: { slug: 'katy' } }),
    ]);
    ids = { electrical: electrical.id, heights: heights.id, katy: katy.id };
  });
  afterAll(() => h.close());

  const createJob = async (token = client.accessToken, photoFileIds: string[] = []) => {
    const res = await h.http
      .post('/v1/jobs')
      .set(bearer(token))
      .send({
        tradeId: ids.electrical,
        areaId: ids.heights,
        description: 'Outlets in two bedrooms stopped working after a storm.',
        addressLine: '1234 Yale St, Houston, TX',
        postalCode: '77008',
        accessNotes: 'Side gate is unlocked',
        preferredDate: tomorrowLocal(),
        timeWindow: 'MORNING',
        photoFileIds,
      })
      .expect(201);
    return res.body as { id: string; ref: string; status: string; photos: { url: string }[] };
  };
  const assign = (jobId: string, artisanId: string) =>
    h.http
      .post(`/v1/admin/jobs/${jobId}/assign`)
      .set(bearer(admin.accessToken))
      .send({ artisanId });
  const offerId = async (jobId: string) =>
    (
      await h.prisma.assignment.findFirstOrThrow({
        where: { jobId, status: { in: ['OFFERED', 'ACCEPTED'] } },
      })
    ).id;
  const job = (jobId: string, token: string) => h.http.get(`/v1/jobs/${jobId}`).set(bearer(token));

  describe('uploads', () => {
    it('uploads a photo directly to storage and serves it back via a signed URL', async () => {
      const fileId = await uploadPhoto(h, client.accessToken, 'JOB_REQUEST_PHOTO');
      const created = await createJob(client.accessToken, [fileId]);
      expect(created.photos).toHaveLength(1);
      const res = await h.http.get(new URL(created.photos[0]!.url).pathname).expect(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      // Shown by the web app from another origin in dev.
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('rejects oversized and unexpected uploads', async () => {
      const big = await h.http
        .post('/v1/files/uploads')
        .set(bearer(client.accessToken))
        .send({ kind: 'JOB_REQUEST_PHOTO', mimeType: 'image/jpeg', sizeBytes: 5_000_000 })
        .expect(400);
      expect(big.body.code).toBe('VALIDATION_ERROR');
      await h.http
        .post('/v1/files/uploads')
        .set(bearer(client.accessToken))
        .send({ kind: 'JOB_REQUEST_PHOTO', mimeType: 'application/pdf', sizeBytes: 100 })
        .expect(400);
      // An upload token cannot be reused for a different content type.
      const t = await h.http
        .post('/v1/files/uploads')
        .set(bearer(client.accessToken))
        .send({ kind: 'JOB_REQUEST_PHOTO', mimeType: 'image/png', sizeBytes: 10 })
        .expect(201);
      await h.http
        .post('/v1/files/local-upload')
        .field('token', t.body.fields.token)
        .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(400);
      // Completing before uploading fails.
      const c = await h.http
        .post(`/v1/files/${t.body.fileId}/complete`)
        .set(bearer(client.accessToken))
        .expect(409);
      expect(c.body.code).toBe('UPLOAD_NOT_FOUND');
    });

    it("cannot attach someone else's photo to a job", async () => {
      const fileId = await uploadPhoto(h, client.accessToken, 'JOB_REQUEST_PHOTO');
      const other = await login(h, uniquePhone());
      const res = await h.http
        .post('/v1/jobs')
        .set(bearer(other.accessToken))
        .send({
          tradeId: ids.electrical,
          areaId: ids.heights,
          description: 'Another description here',
          addressLine: '1 Somewhere Rd, Houston, TX',
          postalCode: '77008',
          preferredDate: tomorrowLocal(),
          timeWindow: 'MORNING',
          photoFileIds: [fileId],
        })
        .expect(400);
      expect(res.body.code).toBe('PHOTOS_INVALID');
    });

    it('sensitive files are admin-only and every view is audited', async () => {
      const owner = await login(h, uniquePhone());
      const file = await h.prisma.file.create({
        data: {
          ownerId: owner.user.id,
          kind: 'ID_DOCUMENT',
          sensitivity: 'SENSITIVE',
          bucket: 'jiko-private',
          storageKey: `id_document/test/${owner.user.id}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 10,
          uploadedAt: new Date(),
        },
      });
      await h.http.get(`/v1/files/${file.id}/url`).set(bearer(owner.accessToken)).expect(404);
      await h.http.get(`/v1/files/${file.id}/url`).set(bearer(client.accessToken)).expect(404);
      await h.http.get(`/v1/files/${file.id}/url`).set(bearer(admin.accessToken)).expect(200);
      expect(
        await h.prisma.auditLog.count({
          where: { action: 'file.view', entityId: file.id, actorId: admin.user.id },
        }),
      ).toBe(1);
    });
  });

  it('validates the requested day', async () => {
    const res = await h.http
      .post('/v1/jobs')
      .set(bearer(client.accessToken))
      .send({
        tradeId: ids.electrical,
        areaId: ids.heights,
        description: 'Valid description text',
        addressLine: '1 Somewhere Rd, Houston, TX',
        postalCode: '77008',
        preferredDate: '2020-01-01',
        timeWindow: 'MORNING',
      })
      .expect(400);
    expect(res.body.code).toBe('DATE_OUT_OF_RANGE');
  });

  describe('assignment', () => {
    it('only offers to sealed, available artisans of the right trade, ranked by area then distance', async () => {
      const sealed = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Tunde Ranked',
      });
      const unsealed = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Not Sealed',
        sealed: false,
      });
      const plumber = await sealedArtisan(h, {
        trade: 'plumbing',
        area: 'heights',
        name: 'Wrong Trade',
      });
      const { id } = await createJob();

      const cands = await h.http
        .get(`/v1/admin/jobs/${id}/candidates`)
        .set(bearer(admin.accessToken))
        .expect(200);
      const candIds = cands.body.map((c: { artisanId: string }) => c.artisanId);
      expect(cands.body.length).toBeLessThanOrEqual(20);
      // The test DB accumulates artisans across runs, so check eligibility via assignment, not the top-20 list.
      await assign(id, sealed.profileId).expect(201);
      expect(candIds).not.toContain(unsealed.profileId);
      expect(candIds).not.toContain(plumber.profileId);
      const areaMatches = cands.body.map((c: { areaMatch: boolean }) => c.areaMatch);
      expect(areaMatches).toEqual(
        [...areaMatches].sort((a: boolean, b: boolean) => Number(b) - Number(a)),
      );

      const bad = await assign(id, unsealed.profileId).expect(422);
      expect(bad.body.code).toBe('ARTISAN_NOT_ELIGIBLE');
      await h.http
        .post(`/v1/admin/jobs/${id}/assign`)
        .set(bearer(client.accessToken))
        .send({ artisanId: sealed.profileId })
        .expect(403);
    });

    it('offers a job with a working-hours deadline and hides the address until accepted', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Emeka Offer',
      });
      const { id } = await createJob();
      await job(id, art.accessToken).expect(404); // not offered yet

      const before = Date.now();
      const res = await assign(id, art.profileId).expect(201);
      const expected = offerExpiresAt(new Date(before)).getTime();
      expect(Math.abs(Date.parse(res.body.expiresAt) - expected)).toBeLessThan(5_000);

      const a = await h.prisma.assignment.findFirstOrThrow({ where: { jobId: id } });
      expect(a.matchSnapshot).toMatchObject({
        artisanId: art.profileId,
        areaMatch: true,
        rank: expect.any(Number),
      });
      expect(
        await h.prisma.auditLog.count({ where: { action: 'assignment.create', entityId: id } }),
      ).toBe(1);

      const offered = await job(id, art.accessToken).expect(200);
      expect(offered.body).toMatchObject({
        status: 'ASSIGNED',
        viewer: 'artisan',
        addressLine: null,
        accessNotes: null,
        postalCode: '77008',
        offer: { status: 'OFFERED' },
      });
      expect(offered.body.client.phone).toMatch(/•/);
      expect(offered.body.actions).toEqual(['acceptOffer', 'declineOffer']);

      const list = await h.http.get('/v1/artisan/jobs').set(bearer(art.accessToken)).expect(200);
      expect(list.body[0]).toMatchObject({ id, status: 'OFFERED', assignmentId: a.id });

      // Client does not see the artisan until they accept.
      expect((await job(id, client.accessToken).expect(200)).body.artisan).toBeNull();
    });

    it('declines: job returns to the queue and the artisan is not offered it again', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Kunle Decline',
      });
      const { id } = await createJob();
      await assign(id, art.profileId).expect(201);
      await h.http
        .post(`/v1/assignments/${await offerId(id)}/decline`)
        .set(bearer(art.accessToken))
        .send({ reason: 'Fully booked tomorrow' })
        .expect(200);

      expect((await job(id, admin.accessToken).expect(200)).body.status).toBe('PENDING_ASSIGNMENT');
      await job(id, art.accessToken).expect(404);
      const cands = await h.http
        .get(`/v1/admin/jobs/${id}/candidates`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(cands.body.map((c: { artisanId: string }) => c.artisanId)).not.toContain(
        art.profileId,
      );

      const p = await h.prisma.artisanProfile.findUniqueOrThrow({ where: { id: art.profileId } });
      expect(p).toMatchObject({ offersReceived: 1, offersAccepted: 0 });
      expect(p.avgResponseSeconds).not.toBeNull();
    });

    it('expires unanswered offers after the deadline', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Sola Late',
      });
      const { id } = await createJob();
      await assign(id, art.profileId).expect(201);
      const aid = await offerId(id);
      await h.prisma.assignment.update({
        where: { id: aid },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      expect(await h.app.get(AssignmentsService).expireDue(new Date())).toBeGreaterThanOrEqual(1);
      expect((await h.prisma.assignment.findUniqueOrThrow({ where: { id: aid } })).status).toBe(
        'EXPIRED',
      );
      const view = await job(id, admin.accessToken).expect(200);
      expect(view.body.status).toBe('PENDING_ASSIGNMENT');
      expect(view.body.timeline.at(-1)).toMatchObject({
        to: 'PENDING_ASSIGNMENT',
        note: 'offer expired',
      });
      const late = await h.http
        .post(`/v1/assignments/${aid}/accept`)
        .set(bearer(art.accessToken))
        .expect(409);
      expect(late.body.code).toBe('OFFER_CLOSED');
    });

    it('an artisan cannot accept an offer late, even before the sweeper runs', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Gbenga Late',
      });
      const { id } = await createJob();
      await assign(id, art.profileId).expect(201);
      const aid = await offerId(id);
      await h.prisma.assignment.update({
        where: { id: aid },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await h.http
        .post(`/v1/assignments/${aid}/accept`)
        .set(bearer(art.accessToken))
        .expect(409);
      expect(res.body.code).toBe('OFFER_EXPIRED');
    });

    it('two parallel accepts: exactly one wins', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Race Accept',
      });
      const { id } = await createJob();
      await assign(id, art.profileId).expect(201);
      const aid = await offerId(id);
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          h.http.post(`/v1/assignments/${aid}/accept`).set(bearer(art.accessToken)),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect(await h.prisma.jobStatusEvent.count({ where: { jobId: id, to: 'ACCEPTED' } })).toBe(1);
    });
  });

  describe('accepted job: chat and quotes', () => {
    let art: Awaited<ReturnType<typeof sealedArtisan>>;
    let jobId: string;

    beforeAll(async () => {
      art = await sealedArtisan(h, { trade: 'electrical', area: 'heights', name: 'Tunde Adeyemi' });
      jobId = (await createJob()).id;
      await assign(jobId, art.profileId).expect(201);
      await h.http
        .post(`/v1/assignments/${await offerId(jobId)}/accept`)
        .set(bearer(art.accessToken))
        .expect(200);
    });

    it('reveals the address to the artisan and the (masked) artisan to the client', async () => {
      const a = await job(jobId, art.accessToken).expect(200);
      expect(a.body).toMatchObject({
        status: 'ACCEPTED',
        addressLine: '1234 Yale St, Houston, TX',
        accessNotes: 'Side gate is unlocked',
      });
      const c = await job(jobId, client.accessToken).expect(200);
      expect(c.body.artisan).toMatchObject({ name: 'Tunde Adeyemi', sealed: true });
      expect(c.body.artisan.phone).toMatch(/^\+1 \(\d{3}\) •••-••\d\d$/);
      const p = await h.prisma.artisanProfile.findUniqueOrThrow({ where: { id: art.profileId } });
      expect(p).toMatchObject({ offersReceived: 1, offersAccepted: 1 });
    });

    it('masks contact details in chat before payment and flags them for ops', async () => {
      await h.http
        .post(`/v1/jobs/${jobId}/messages`)
        .set(bearer(client.accessToken))
        .send({ body: 'Please call me at (713) 555-0123 when you arrive' })
        .expect(201);
      await h.http
        .post(`/v1/jobs/${jobId}/messages`)
        .set(bearer(art.accessToken))
        .send({ body: 'I will come at 9am' })
        .expect(201);

      const seenByArtisan = await h.http
        .get(`/v1/jobs/${jobId}/messages`)
        .set(bearer(art.accessToken))
        .expect(200);
      expect(seenByArtisan.body[0]).toMatchObject({
        from: 'client',
        body: 'Please call me at [hidden until payment] when you arrive',
      });
      expect(seenByArtisan.body[0].originalBody).toBeUndefined();
      expect(seenByArtisan.body[1]).toMatchObject({ from: 'me', body: 'I will come at 9am' });

      const seenByAdmin = await h.http
        .get(`/v1/jobs/${jobId}/messages`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(seenByAdmin.body[0]).toMatchObject({
        contactInfoFlag: true,
        originalBody: 'Please call me at (713) 555-0123 when you arrive',
      });

      const after = seenByArtisan.body[0].createdAt;
      const polled = await h.http
        .get(`/v1/jobs/${jobId}/messages?after=${encodeURIComponent(after)}`)
        .set(bearer(client.accessToken))
        .expect(200);
      expect(polled.body).toHaveLength(1);
    });

    it('quotes: itemised, split snapshotted, revisable; client sees totals but not the split', async () => {
      const v1 = await h.http
        .post(`/v1/jobs/${jobId}/quotes`)
        .set(bearer(art.accessToken))
        .send({
          items: [
            {
              kind: 'LABOUR',
              description: 'Rewire 2 socket circuits',
              quantity: 1,
              unitPriceCents: 25_000,
            },
            {
              kind: 'MATERIAL',
              description: '12-gauge wire, 50 ft',
              quantity: 1,
              unitPriceCents: 9_000,
            },
            { kind: 'MATERIAL', description: '15A outlets', quantity: 4, unitPriceCents: 1_500 },
            { kind: 'MATERIAL', description: '20A breaker', quantity: 1, unitPriceCents: 4_500 },
          ],
        })
        .expect(201);
      expect(v1.body).toMatchObject({
        version: 1,
        totalCents: 44_500,
        reviewStatus: 'NOT_REQUIRED',
      });

      const forArtisan = (await job(jobId, art.accessToken).expect(200)).body;
      expect(forArtisan.status).toBe('QUOTED');
      expect(forArtisan.quote.split).toEqual({
        commissionCents: 6_675,
        commissionFromMaterialsCents: 0,
        artisanPayoutCents: 37_825,
        materialsAdvanceCents: 19_500,
        completionPayoutCents: 18_325,
        materialsAdvanceCapCents: 50_000,
      });
      const forClient = (await job(jobId, client.accessToken).expect(200)).body;
      expect(forClient.quote).toMatchObject({
        totalCents: 44_500,
        labourCents: 25_000,
        materialsCents: 19_500,
      });
      expect(forClient.quote.split).toBeUndefined();
      expect(forClient.actions.sort()).toEqual(['approveQuote', 'cancel', 'rejectQuote']);

      // Revision supersedes v1.
      const v2 = await h.http
        .post(`/v1/jobs/${jobId}/quotes`)
        .set(bearer(art.accessToken))
        .send({
          items: [
            { kind: 'LABOUR', description: 'Rewire', quantity: 1, unitPriceCents: 20_000 },
            { kind: 'MATERIAL', description: 'Cable', quantity: 1, unitPriceCents: 9_000 },
          ],
        })
        .expect(201);
      expect(v2.body.version).toBe(2);
      expect((await h.prisma.quote.findFirstOrThrow({ where: { jobId, version: 1 } })).status).toBe(
        'SUPERSEDED',
      );

      // Client asks for changes → back to ACCEPTED; artisan re-quotes; client approves.
      await h.http
        .post(`/v1/quotes/${v2.body.quoteId}/reject`)
        .set(bearer(client.accessToken))
        .send({ reason: 'Cable seems expensive' })
        .expect(200);
      expect((await job(jobId, client.accessToken)).body.status).toBe('ACCEPTED');
      await h.http
        .post(`/v1/quotes/${v2.body.quoteId}/approve`)
        .set(bearer(client.accessToken))
        .expect(409);

      const v3 = await h.http
        .post(`/v1/jobs/${jobId}/quotes`)
        .set(bearer(art.accessToken))
        .send({
          items: [
            { kind: 'LABOUR', description: 'Rewire', quantity: 1, unitPriceCents: 20_000 },
            { kind: 'MATERIAL', description: 'Cable', quantity: 1, unitPriceCents: 7_000 },
          ],
        })
        .expect(201);
      // Artisans also hold CLIENT (dual roles) but are not this job's client, so the quote is invisible to them.
      await h.http
        .post(`/v1/quotes/${v3.body.quoteId}/approve`)
        .set(bearer(art.accessToken))
        .expect(404);
      await h.http
        .post(`/v1/quotes/${v3.body.quoteId}/approve`)
        .set(bearer(client.accessToken))
        .expect(200);
      const approved = (await job(jobId, client.accessToken)).body;
      expect(approved).toMatchObject({
        status: 'AWAITING_PAYMENT',
        quote: { version: 3, status: 'APPROVED', reviewStatus: 'NOT_REQUIRED' },
      });

      // Locked once approved.
      const late = await h.http
        .post(`/v1/jobs/${jobId}/quotes`)
        .set(bearer(art.accessToken))
        .send({
          items: [{ kind: 'LABOUR', description: 'Extra work', quantity: 1, unitPriceCents: 100 }],
        })
        .expect(409);
      expect(late.body.code).toBe('INVALID_JOB_STATE');
      // Contact details still masked: not paid yet.
      expect(approved.artisan.phone).toMatch(/•/);
    });
  });

  describe('materials-heavy quotes need Jiko review', () => {
    it('flags >70% materials, lets admin reject or approve, and audits the decision', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Heavy Materials',
      });
      const { id } = await createJob();
      await assign(id, art.profileId).expect(201);
      await h.http
        .post(`/v1/assignments/${await offerId(id)}/accept`)
        .set(bearer(art.accessToken))
        .expect(200);

      const heavy = {
        items: [
          {
            kind: 'LABOUR',
            description: 'Install compressor',
            quantity: 1,
            unitPriceCents: 2_000,
          },
          {
            kind: 'MATERIAL',
            description: '3-ton AC compressor',
            quantity: 1,
            unitPriceCents: 200_000,
          },
        ],
      };
      const q1 = await h.http
        .post(`/v1/jobs/${id}/quotes`)
        .set(bearer(art.accessToken))
        .send(heavy)
        .expect(201);
      expect(q1.body.reviewStatus).toBe('PENDING');
      // Shortfall comes out of materials; advance capped at $500.
      const split = (await job(id, art.accessToken)).body.quote.split;
      expect(split).toMatchObject({
        commissionCents: 30_300,
        commissionFromMaterialsCents: 28_300,
        materialsAdvanceCents: 50_000,
        completionPayoutCents: 121_700,
      });

      const pending = await h.http
        .get('/v1/admin/quotes/pending-review')
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(pending.body.map((q: { id: string }) => q.id)).toContain(q1.body.quoteId);

      await h.http
        .post(`/v1/admin/quotes/${q1.body.quoteId}/review`)
        .set(bearer(admin.accessToken))
        .send({ decision: 'REJECT', note: 'Compressor price above market; please re-check' })
        .expect(200);
      expect((await job(id, art.accessToken)).body).toMatchObject({
        status: 'ACCEPTED',
        quote: { status: 'REJECTED', reviewStatus: 'REJECTED' },
      });
      expect(
        await h.prisma.auditLog.count({
          where: { action: 'quote.review.reject', entityId: q1.body.quoteId },
        }),
      ).toBe(1);

      const q2 = await h.http
        .post(`/v1/jobs/${id}/quotes`)
        .set(bearer(art.accessToken))
        .send(heavy)
        .expect(201);
      await h.http
        .post(`/v1/quotes/${q2.body.quoteId}/approve`)
        .set(bearer(client.accessToken))
        .expect(200);
      const waiting = (await job(id, client.accessToken)).body;
      expect(waiting).toMatchObject({
        status: 'AWAITING_PAYMENT',
        quote: { reviewStatus: 'PENDING' },
      });

      await h.http
        .post(`/v1/admin/quotes/${q2.body.quoteId}/review`)
        .set(bearer(admin.accessToken))
        .send({ decision: 'APPROVE', note: 'Matches supplier price list' })
        .expect(200);
      expect((await job(id, client.accessToken)).body).toMatchObject({
        status: 'AWAITING_PAYMENT',
        quote: { reviewStatus: 'APPROVED' },
      });
      await h.http
        .post(`/v1/admin/quotes/${q2.body.quoteId}/review`)
        .set(bearer(admin.accessToken))
        .send({ decision: 'APPROVE', note: 'again' })
        .expect(409);
    });
  });

  describe('withdraw and cancel', () => {
    it('admin withdraws an assignment: job back in the queue, artisan loses access, audited', async () => {
      const art = await sealedArtisan(h, {
        trade: 'electrical',
        area: 'heights',
        name: 'Withdrawn Artisan',
      });
      const { id } = await createJob();
      await assign(id, art.profileId).expect(201);
      await h.http
        .post(`/v1/assignments/${await offerId(id)}/accept`)
        .set(bearer(art.accessToken))
        .expect(200);
      await h.http
        .post(`/v1/admin/jobs/${id}/withdraw`)
        .set(bearer(admin.accessToken))
        .send({ reason: 'Artisan unreachable' })
        .expect(200);
      expect((await job(id, client.accessToken)).body).toMatchObject({
        status: 'PENDING_ASSIGNMENT',
        artisan: null,
      });
      await job(id, art.accessToken).expect(404);
      await h.http.get(`/v1/jobs/${id}/messages`).set(bearer(art.accessToken)).expect(404);
      expect(
        await h.prisma.auditLog.count({ where: { action: 'assignment.withdraw', entityId: id } }),
      ).toBe(1);
      // Acceptance still counts toward the artisan's stats.
      expect(
        (await h.prisma.artisanProfile.findUniqueOrThrow({ where: { id: art.profileId } }))
          .offersAccepted,
      ).toBe(1);
    });

    it('client cancels before payment; cancelling twice conflicts; strangers see 404', async () => {
      const { id } = await createJob();
      const stranger = await login(h, uniquePhone());
      await h.http
        .post(`/v1/jobs/${id}/cancel`)
        .set(bearer(stranger.accessToken))
        .send({ reason: 'not mine' })
        .expect(404);
      await job(id, stranger.accessToken).expect(404);
      const res = await h.http
        .post(`/v1/jobs/${id}/cancel`)
        .set(bearer(client.accessToken))
        .send({ reason: 'Fixed it myself' })
        .expect(200);
      expect(res.body.status).toBe('CANCELLED');
      const again = await h.http
        .post(`/v1/jobs/${id}/cancel`)
        .set(bearer(client.accessToken))
        .send({ reason: 'again' })
        .expect(409);
      expect(again.body.code).toBe('INVALID_JOB_STATE');
    });
  });

  it('admin queue lists oldest first and summarises the pipeline', async () => {
    const queue = await h.http
      .get('/v1/admin/jobs?status=PENDING_ASSIGNMENT')
      .set(bearer(admin.accessToken))
      .expect(200);
    const times = queue.body.map((j: { createdAt: string }) => j.createdAt);
    expect(times).toEqual([...times].sort());
    expect(queue.body.every((j: { status: string }) => j.status === 'PENDING_ASSIGNMENT')).toBe(
      true,
    );
    const summary = await h.http
      .get('/v1/admin/jobs/summary')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(summary.body.byStatus.PENDING_ASSIGNMENT).toBeGreaterThan(0);
    await h.http.get('/v1/admin/jobs').set(bearer(client.accessToken)).expect(403);
  });

  it("lists a client's own jobs", async () => {
    const mine = await h.http.get('/v1/jobs').set(bearer(client.accessToken)).expect(200);
    expect(mine.body.length).toBeGreaterThan(3);
    expect(mine.body[0]).toMatchObject({ trade: 'Electrical', area: 'Houston Heights' });
  });
});
