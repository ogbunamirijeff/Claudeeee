import type { Metadata } from 'next';
import Link from 'next/link';
import { formatCents } from '@jiko/shared/money';
import { apiGet } from '@/lib/api';
import { JOB_STATUS_LABEL, since } from '@/lib/labels';
import type { AdminJobRow } from '../types';

export const metadata: Metadata = { title: 'Job pipeline' };
export const dynamic = 'force-dynamic';

const COLUMNS = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'QUOTED',
  'AWAITING_PAYMENT',
  'PAID',
  'IN_PROGRESS',
  'WORK_SUBMITTED',
  'DISPUTED',
  'COMPLETED',
];

export default async function PipelinePage() {
  const jobs = await apiGet<AdminJobRow[]>(`/v1/admin/jobs?status=${COLUMNS.join(',')}&take=200`);
  const now = Date.now();
  return (
    <main className="space-y-4 p-4 md:p-7">
      <h1 className="text-2xl font-semibold">Job pipeline</h1>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const items = jobs.filter((j) => j.status === col);
          return (
            <section
              key={col}
              className="w-60 shrink-0 space-y-2"
              aria-label={JOB_STATUS_LABEL[col]}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                {JOB_STATUS_LABEL[col]} <span className="text-muted">{items.length}</span>
              </h2>
              {items.map((j) => (
                <Link
                  key={j.id}
                  href={`/admin/jobs/${j.id}`}
                  className="block space-y-1 rounded-lg border border-line bg-surface p-3 text-sm hover:border-muted"
                >
                  <div className="flex justify-between font-semibold">
                    <span>{j.ref}</span>
                    <span className="text-xs font-normal text-muted">
                      {since(j.statusSince, now)}
                    </span>
                  </div>
                  <p className="text-muted">
                    {j.trade} · {j.area}
                  </p>
                  {j.artisanName && (
                    <p className="text-xs">
                      {j.artisanName}
                      {j.offerStatus === 'OFFERED' ? ' (offered)' : ''}
                    </p>
                  )}
                  {j.quoteTotalCents !== null && (
                    <p className="text-xs tabular-nums">
                      {formatCents(j.quoteTotalCents)}
                      {j.quoteReviewStatus === 'PENDING' ? ' · review' : ''}
                    </p>
                  )}
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
