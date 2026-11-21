import { formatCents } from '@jiko/shared/money';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = { title: 'Payments' };
export const dynamic = 'force-dynamic';

interface PaymentRow {
  id: string;
  jobId: string;
  jobRef: string;
  jobStatus: string;
  status: string;
  amountCents: number;
  feesCents: number | null;
  heldCents: number;
  releasedCents: number;
  refundedCents: number;
  commissionCents: number;
  paidOutCents: number;
  awaitingPayoutCents: number;
  paidAt: string | null;
}

const TONE: Record<string, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  INITIALIZED: 'neutral',
  HELD: 'info',
  PARTIALLY_RELEASED: 'info',
  RELEASED: 'success',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'warning',
  FAILED: 'danger',
};

/** Payments ledger: every figure is derived from the append-only ledger. */
export default async function PaymentsPage() {
  const rows = await apiGet<PaymentRow[]>('/v1/admin/payments');
  const sum = (k: keyof PaymentRow) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const totals = [
    ['Held now', sum('heldCents')],
    ['Commission earned', sum('commissionCents')],
    ['Paid out to pros', sum('paidOutCents')],
    ['Awaiting payout', sum('awaitingPayoutCents')],
    ['Refunded', sum('refundedCents')],
    ['Stripe fees', sum('feesCents')],
  ] as const;
  return (
    <main className="space-y-4 p-4 md:p-7">
      <h1 className="text-2xl font-semibold">Payments</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {totals.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface p-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-lg font-semibold tabular-nums">{formatCents(v)}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              {[
                'Job',
                'Status',
                'Charged',
                'Held',
                'Released',
                'Commission',
                'Paid out',
                'Awaiting payout',
                'Refunded',
                'Fee',
                'Paid',
              ].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-semibold">
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={`/admin/jobs/${r.jobId}`}
                  >
                    {r.jobRef}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={TONE[r.status] ?? 'neutral'}>
                    {r.status.toLowerCase().replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-3 py-2">{formatCents(r.amountCents)}</td>
                <td className="px-3 py-2">{formatCents(r.heldCents)}</td>
                <td className="px-3 py-2">{formatCents(r.releasedCents)}</td>
                <td className="px-3 py-2">{formatCents(r.commissionCents)}</td>
                <td className="px-3 py-2">{formatCents(r.paidOutCents)}</td>
                <td className="px-3 py-2">
                  {r.awaitingPayoutCents ? (
                    <Badge tone="warning">{formatCents(r.awaitingPayoutCents)}</Badge>
                  ) : (
                    formatCents(0)
                  )}
                </td>
                <td className="px-3 py-2">{formatCents(r.refundedCents)}</td>
                <td className="px-3 py-2">
                  {r.feesCents === null ? '—' : formatCents(r.feesCents)}
                </td>
                <td className="px-3 py-2">
                  {r.paidAt
                    ? new Date(r.paidAt).toLocaleDateString('en-US', {
                        timeZone: 'America/Chicago',
                      })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
