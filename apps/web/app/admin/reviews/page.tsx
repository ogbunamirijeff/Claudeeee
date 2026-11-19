import type { Metadata } from 'next';
import Link from 'next/link';
import { formatCents } from '@jiko/shared/money';
import { Card } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { ReviewActions } from './ReviewActions';

export const metadata: Metadata = { title: 'Quotes to review' };
export const dynamic = 'force-dynamic';

interface PendingQuote {
  id: string;
  version: number;
  totalCents: number;
  labourCents: number;
  materialsCents: number;
  submittedAt: string;
  status: string;
  items: { kind: string; description: string; quantity: number; totalCents: number }[];
  job: { id: string; ref: string; trade: { name: string } };
  artisan: { displayName: string };
}

export default async function ReviewsPage() {
  const quotes = await apiGet<PendingQuote[]>('/v1/admin/quotes/pending-review');
  return (
    <main className="max-w-3xl space-y-4 p-4 md:p-7">
      <h1 className="text-2xl font-semibold">Quotes to review</h1>
      <p className="text-sm text-muted">
        Quotes where materials are more than 70% of the total. The client can&apos;t pay until one
        of you approves.
      </p>
      {quotes.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          Nothing to review.
        </p>
      )}
      {quotes.map((q) => (
        <Card key={q.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={`/admin/jobs/${q.job.id}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {q.job.ref} · {q.job.trade.name}
            </Link>
            <span className="text-sm text-muted">
              {q.artisan.displayName} · v{q.version} ·{' '}
              {q.status === 'APPROVED' ? 'client approved' : 'awaiting client'}
            </span>
          </div>
          <ul className="space-y-1 text-sm">
            {q.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-3">
                <span className="text-muted">
                  {i.kind === 'LABOUR' ? 'Labor' : 'Materials'} · {i.description}
                  {i.quantity > 1 ? ` × ${i.quantity}` : ''}
                </span>
                <span className="tabular-nums">{formatCents(i.totalCents)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold">
            Total {formatCents(q.totalCents)} · materials{' '}
            {Math.round((q.materialsCents / q.totalCents) * 100)}%
          </p>
          <ReviewActions quoteId={q.id} />
        </Card>
      ))}
    </main>
  );
}
