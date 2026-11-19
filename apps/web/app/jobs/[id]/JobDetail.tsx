'use client';

import type { JobView } from '@jiko/shared';
import { formatCents } from '@jiko/shared/money';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Chat } from '@/components/Chat';
import { QuoteCard } from '@/components/QuoteCard';
import { Badge, Banner, btn, Card, input } from '@/components/ui';
import { api, errorMessage } from '@/lib/client-api';
import { formatDay, JOB_STATUS_LABEL, JOB_STATUS_TONE, TIME_WINDOW } from '@/lib/labels';

export function JobDetail({ job, justCreated }: { job: JobView; justCreated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const can = (a: string) => job.actions.includes(a as never);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body });
      setRejecting(false);
      setReason('');
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const q = job.quote;
  const waitingReview = job.status === 'AWAITING_PAYMENT' && q?.reviewStatus === 'PENDING';
  const chatOpen = !!job.artisan && !['CANCELLED', 'REFUNDED'].includes(job.status);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      {justCreated && (
        <Banner tone="success">
          Request received. We&apos;ll match you with a Craft Seal artisan and let you know.
        </Banner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">
          {job.trade.name} · {job.area.name}
        </h1>
        <Badge tone={JOB_STATUS_TONE[job.status]}>
          {JOB_STATUS_LABEL[job.status] ?? job.status}
        </Badge>
      </div>
      <p className="text-sm text-muted">
        {job.ref} · {formatDay(job.preferredDate)}, {TIME_WINDOW[job.timeWindow]}
      </p>

      {job.artisan && (
        <Card className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold">
            {job.artisan.name?.[0] ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{job.artisan.name}</p>
            <p className="text-sm text-muted">
              {job.artisan.ratingCount > 0 ? `★ ${job.artisan.ratingAvg.toFixed(1)} · ` : ''}
              {job.artisan.jobsCompleted} jobs on Jiko
            </p>
            <p className="text-sm tabular-nums text-muted">{job.artisan.phone}</p>
          </div>
          {job.artisan.sealed && <Badge tone="success">Craft Seal</Badge>}
        </Card>
      )}

      {job.status === 'PENDING_ASSIGNMENT' || job.status === 'ASSIGNED' ? (
        <Banner tone="info">
          We&apos;re finding a Craft Seal artisan near you. This usually takes under 2 working
          hours.
        </Banner>
      ) : null}

      {q && (
        <section className="space-y-3">
          <h2 className="font-semibold">
            {job.status === 'QUOTED' ? 'Your quote is ready' : 'Quote'}
          </h2>
          {waitingReview && (
            <Banner tone="warning">
              This quote is mostly parts, so a Jiko specialist checks the prices before you pay.
              Usually within 2 working hours.
            </Banner>
          )}
          <QuoteCard quote={q} />
          {can('approveQuote') && q.status === 'SUBMITTED' && (
            <div className="space-y-2">
              <Banner tone="success">
                Your money is held by Jiko. The artisan is paid only when you confirm the job is
                done. 7-day redo guarantee.
              </Banner>
              <button
                className={btn.primary}
                disabled={busy}
                onClick={() => void act(`/quotes/${q.id}/approve`)}
              >
                Approve quote · {formatCents(q.totalCents)}
              </button>
              {!rejecting ? (
                <button
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() => setRejecting(true)}
                >
                  Ask for changes
                </button>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(`/quotes/${q.id}/reject`, { reason });
                  }}
                >
                  <input
                    className={input}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="What should change?"
                    aria-label="What should change?"
                  />
                  <button className={btn.secondary} disabled={busy || reason.trim().length < 3}>
                    Send to artisan
                  </button>
                </form>
              )}
            </div>
          )}
          {job.status === 'AWAITING_PAYMENT' && !waitingReview && (
            <Banner tone="info">Quote approved. Secure payment opens in the next release.</Banner>
          )}
        </section>
      )}

      <Card className="space-y-2 text-sm">
        <p>{job.description}</p>
        {job.addressLine && (
          <p className="text-muted">
            {job.addressLine}
            {`, ${job.postalCode}`}
            {job.accessNotes ? ` · ${job.accessNotes}` : ''}
          </p>
        )}
        {job.photos.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {job.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                <img
                  src={p.url}
                  alt="Job photo"
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px] rounded-lg object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
      </Card>

      {chatOpen && <Chat jobId={job.id} />}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">History</summary>
        <ol className="mt-2 space-y-1">
          {job.timeline.map((t, i) => (
            <li key={i} className="text-muted">
              {new Date(t.at).toLocaleString('en-US', {
                timeZone: 'America/Chicago',
                dateStyle: 'medium',
                timeStyle: 'short',
              })}{' '}
              — {JOB_STATUS_LABEL[t.to] ?? t.to}
            </li>
          ))}
        </ol>
      </details>

      {can('cancel') && (
        <button
          className="text-sm text-muted underline underline-offset-4"
          disabled={busy}
          onClick={() => {
            const r = window.prompt('Why are you cancelling?');
            if (r && r.trim().length >= 3) void act(`/jobs/${job.id}/cancel`, { reason: r.trim() });
          }}
        >
          Cancel this request
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </main>
  );
}
