'use client';

import type { CandidateView } from '@jiko/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, btn, input } from '@/components/ui';
import { api, errorMessage } from '@/lib/client-api';

function responseTime(s: number | null) {
  if (s === null) return 'no replies yet';
  return s < 3600
    ? `~${Math.max(1, Math.round(s / 60))} min reply`
    : `~${Math.round(s / 3600)} h reply`;
}

export function AdminJobActions(props: {
  jobId: string;
  status: string;
  actions: string[];
  candidates: CandidateView[];
  tradeName: string;
  areaName: string;
}) {
  const router = useRouter();
  const [pick, setPick] = useState(props.candidates[0]?.artisanId ?? null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: 'POST', body });
      setReason('');
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const chosen = props.candidates.find((c) => c.artisanId === pick);
  return (
    <div className="space-y-4">
      {props.status === 'PENDING_ASSIGNMENT' && (
        <section className="space-y-3">
          <h2 className="font-semibold">
            Sealed {props.tradeName.toLowerCase()} artisans near {props.areaName}
          </h2>
          {props.candidates.length === 0 && (
            <p className="text-sm text-muted">
              No eligible artisans. Check the artisan list or availability.
            </p>
          )}
          <div role="radiogroup" className="space-y-2">
            {props.candidates.map((c) => (
              <button
                key={c.artisanId}
                type="button"
                role="radio"
                aria-checked={pick === c.artisanId}
                onClick={() => setPick(c.artisanId)}
                className={`block w-full rounded-lg border bg-surface p-3 text-left ${pick === c.artisanId ? 'border-2 border-brand' : 'border-line'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <Badge tone={c.areaMatch ? 'success' : 'neutral'}>
                    {c.areaMatch ? props.areaName : (c.areas[0] ?? '—')}
                    {c.distanceMiles !== null ? ` · ${c.distanceMiles} mi` : ''}
                  </Badge>
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {c.ratingCount ? `${c.ratingAvg.toFixed(1)} ★` : 'new'} ·{' '}
                  {Math.round(c.completionRate * 100)}% done · {responseTime(c.avgResponseSeconds)}{' '}
                  · {c.activeJobs} active
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            The offer expires 2 working hours after sending (7 AM–8 PM Houston time).
          </p>
          <button
            className={btn.primary}
            disabled={busy || !chosen}
            onClick={() => void run(`/admin/jobs/${props.jobId}/assign`, { artisanId: pick })}
          >
            {chosen ? `Offer job to ${chosen.name}` : 'Choose an artisan'}
          </button>
        </section>
      )}

      {(props.actions.includes('withdrawAssignment') ||
        props.actions.includes('cancel') ||
        props.actions.includes('refundBeforeStart')) && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Ops actions</h2>
          <input
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (kept in the audit log)"
            aria-label="Reason"
          />
          <div className="flex flex-wrap gap-2">
            {props.actions.includes('withdrawAssignment') && (
              <button
                className={btn.smallSecondary}
                disabled={busy || reason.trim().length < 3}
                onClick={() => void run(`/admin/jobs/${props.jobId}/withdraw`, { reason })}
              >
                Withdraw artisan
              </button>
            )}
            {props.actions.includes('cancel') && (
              <button
                className={btn.smallSecondary}
                disabled={busy || reason.trim().length < 3}
                onClick={() => void run(`/jobs/${props.jobId}/cancel`, { reason })}
              >
                Cancel job
              </button>
            )}
            {props.actions.includes('refundBeforeStart') && (
              <button
                className={btn.smallSecondary}
                disabled={busy || reason.trim().length < 3}
                onClick={() => {
                  if (window.confirm('Refund everything held for this job to the client?'))
                    void run(`/admin/jobs/${props.jobId}/refund`, { reason });
                }}
              >
                Refund client in full
              </button>
            )}
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
