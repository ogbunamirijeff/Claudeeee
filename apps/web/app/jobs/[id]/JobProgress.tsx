'use client';

import type { JobView } from '@jiko/shared';
import { formatCents } from '@jiko/shared/money';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Banner, btn } from '@/components/ui';
import { api, errorMessage } from '@/lib/client-api';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Client-side money and completion steps: pay → held → in progress → confirm → guarantee. */
export function JobProgress({ job, justPaid }: { job: JobView; justPaid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitedForWebhook, setWaited] = useState(0);

  // Back from Checkout: the webhook usually lands within seconds; refresh until the job is PAID.
  useEffect(() => {
    if (!justPaid || job.status !== 'AWAITING_PAYMENT' || waitedForWebhook >= 10) return;
    const t = setTimeout(() => {
      setWaited((n) => n + 1);
      router.refresh();
    }, 2000);
    return () => clearTimeout(t);
  }, [justPaid, job.status, waitedForWebhook, router]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(`/jobs/${job.id}/checkout`, { method: 'POST' });
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function confirm() {
    if (
      !window.confirm(
        'Confirm the job is done? The pro gets paid and the 7-day redo guarantee starts.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api(`/jobs/${job.id}/confirm`, { method: 'POST' });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const afterPhotos = job.photos.filter((p) => p.kind === 'JOB_PHOTO_AFTER');
  return (
    <section className="space-y-3" aria-label="Payment and progress">
      {job.canPay && job.quote && (
        <>
          <Banner tone="success">
            Pay securely with Stripe. Jiko holds your money and only pays the pro when you confirm
            the job is done.
          </Banner>
          <button className={btn.primary} disabled={busy} onClick={() => void pay()}>
            {busy ? 'Opening secure checkout…' : `Pay ${formatCents(job.quote.totalCents)}`}
          </button>
        </>
      )}
      {justPaid && job.status === 'AWAITING_PAYMENT' && (
        <Banner tone="info">Payment received — confirming with the bank…</Banner>
      )}
      {job.status === 'PAID' && (
        <Banner tone="success">
          Paid — Jiko is holding your money. Your pro will start on the scheduled day.
        </Banner>
      )}
      {job.status === 'IN_PROGRESS' && (
        <Banner tone="info">
          Your pro is on site and working. Materials have been paid for; the rest stays held until
          you confirm.
        </Banner>
      )}
      {job.status === 'WORK_SUBMITTED' && (
        <div className="space-y-3">
          <Banner tone="warning">
            Your pro marked the job done. Check the work, then confirm.
            {job.autoReleaseAt
              ? ` If you don’t confirm or report a problem, payment is released automatically ${when(job.autoReleaseAt)}.`
              : ''}
          </Banner>
          {afterPhotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {afterPhotos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt="After photo"
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px] rounded-lg object-cover"
                />
              ))}
            </div>
          )}
          <button className={btn.primary} disabled={busy} onClick={() => void confirm()}>
            Confirm job is done
          </button>
        </div>
      )}
      {job.status === 'COMPLETED' &&
        job.guaranteeExpiresAt &&
        Date.parse(job.guaranteeExpiresAt) > Date.now() && (
          <Banner tone="success">
            Completed. Your 7-day redo guarantee runs until {when(job.guaranteeExpiresAt)}.
          </Banner>
        )}
      {job.status === 'REFUNDED' && job.payment && (
        <Banner tone="info">
          Refunded {formatCents(job.payment.amountCents)} to your card. Banks usually show it within
          5–10 days.
        </Banner>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
