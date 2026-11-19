import { JobStatus } from '../enums';
import { JOB_TRANSITIONS, availableJobActions, checkJobTransition, type JobAction } from './job';

const ALL = Object.keys(JobStatus) as JobStatus[];

describe('job state machine', () => {
  it('walks the happy path end to end', () => {
    const path: [JobAction, JobStatus, 'CLIENT' | 'ARTISAN' | 'ADMIN' | 'SYSTEM', object?][] = [
      ['assign', 'PENDING_ASSIGNMENT', 'ADMIN'],
      ['acceptOffer', 'ASSIGNED', 'ARTISAN'],
      ['submitQuote', 'ACCEPTED', 'ARTISAN'],
      ['approveQuote', 'QUOTED', 'CLIENT'],
      ['markPaid', 'AWAITING_PAYMENT', 'SYSTEM', { quoteReviewStatus: 'NOT_REQUIRED' }],
      ['startWork', 'PAID', 'ARTISAN', { hasBeforePhoto: true }],
      [
        'submitWork',
        'IN_PROGRESS',
        'ARTISAN',
        { hasAfterPhoto: true, quoteMaterialsCents: 5000, hasMaterialsReceipt: true },
      ],
      ['confirmCompletion', 'WORK_SUBMITTED', 'CLIENT'],
    ];
    const expected: JobStatus[] = [
      'ASSIGNED',
      'ACCEPTED',
      'QUOTED',
      'AWAITING_PAYMENT',
      'PAID',
      'IN_PROGRESS',
      'WORK_SUBMITTED',
      'COMPLETED',
    ];
    path.forEach(([action, from, actor, ctx], i) => {
      expect(checkJobTransition(action, from, actor, ctx)).toEqual({
        ok: true,
        from,
        to: expected[i],
      });
    });
  });

  it('rejects every action from every status it does not list', () => {
    for (const [action, def] of Object.entries(JOB_TRANSITIONS) as [
      JobAction,
      (typeof JOB_TRANSITIONS)[JobAction],
    ][]) {
      for (const from of ALL) {
        const r = checkJobTransition(action, from, def.actors[0], {
          quoteReviewStatus: 'APPROVED',
          hasBeforePhoto: true,
          hasAfterPhoto: true,
          hasMaterialsReceipt: true,
          autoReleaseAt: new Date(0),
          guaranteeExpiresAt: new Date(8.64e15),
        });
        expect(r.ok).toBe((def.from as readonly JobStatus[]).includes(from));
      }
    }
  });

  it('enforces who may act', () => {
    expect(checkJobTransition('assign', 'PENDING_ASSIGNMENT', 'CLIENT')).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(checkJobTransition('approveQuote', 'QUOTED', 'ARTISAN')).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(checkJobTransition('acceptOffer', 'ASSIGNED', 'ADMIN')).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
  });

  it('blocks payment while a materials-heavy quote awaits review', () => {
    expect(
      checkJobTransition('markPaid', 'AWAITING_PAYMENT', 'SYSTEM', {
        quoteReviewStatus: 'PENDING',
      }),
    ).toMatchObject({ ok: false, code: 'GUARD_FAILED' });
    expect(
      checkJobTransition('markPaid', 'AWAITING_PAYMENT', 'SYSTEM', {
        quoteReviewStatus: 'APPROVED',
      }).ok,
    ).toBe(true);
  });

  it('requires a before-photo to start and after-photo + receipt to submit', () => {
    expect(checkJobTransition('startWork', 'PAID', 'ARTISAN', {})).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/before-photo/),
    });
    expect(
      checkJobTransition('submitWork', 'IN_PROGRESS', 'ARTISAN', {
        hasAfterPhoto: true,
        quoteMaterialsCents: 100,
      }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/receipt/) });
    expect(
      checkJobTransition('submitWork', 'IN_PROGRESS', 'ARTISAN', {
        hasAfterPhoto: true,
        quoteMaterialsCents: 0,
      }).ok,
    ).toBe(true);
  });

  it('auto-releases only after the deadline; warranty only within 7 days', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(
      checkJobTransition('autoRelease', 'WORK_SUBMITTED', 'SYSTEM', {
        autoReleaseAt: new Date('2026-11-20T13:00:00Z'),
        now,
      }).ok,
    ).toBe(false);
    expect(
      checkJobTransition('autoRelease', 'WORK_SUBMITTED', 'SYSTEM', {
        autoReleaseAt: new Date('2026-11-20T11:00:00Z'),
        now,
      }).ok,
    ).toBe(true);
    expect(
      checkJobTransition('openWarrantyClaim', 'COMPLETED', 'CLIENT', {
        guaranteeExpiresAt: new Date('2026-11-19T00:00:00Z'),
        now,
      }).ok,
    ).toBe(false);
  });

  it('cannot cancel after payment, only refund', () => {
    expect(checkJobTransition('cancel', 'PAID', 'CLIENT').ok).toBe(false);
    expect(checkJobTransition('refundBeforeStart', 'PAID', 'ADMIN').ok).toBe(true);
  });

  it('lists available actions per actor', () => {
    expect(availableJobActions('QUOTED', 'CLIENT').sort()).toEqual([
      'approveQuote',
      'cancel',
      'rejectQuote',
    ]);
    expect(availableJobActions('REFUNDED', 'ADMIN')).toEqual([]);
  });
});
