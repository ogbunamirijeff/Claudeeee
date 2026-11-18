import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { formatDay, since } from '@/lib/labels';
import type { AdminJobRow } from './types';

export const metadata: Metadata = { title: 'Request queue' };
export const dynamic = 'force-dynamic';

const WINDOW_SHORT: Record<string, string> = { MORNING: 'AM', AFTERNOON: 'PM', EVENING: 'EVE' };

export default async function QueuePage() {
  const jobs = await apiGet<AdminJobRow[]>('/v1/admin/jobs?status=PENDING_ASSIGNMENT');
  const now = Date.now();
  return (
    <main className="space-y-4 p-4 md:p-7">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Request queue</h1>
        <Badge tone="info">{jobs.length} waiting</Badge>
      </div>
      {jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          Queue is empty.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                {['Ref', 'Trade', 'Area', 'Problem', 'When', 'Waiting'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((j) => {
                const waitedMin = (now - Date.parse(j.statusSince)) / 60_000;
                return (
                  <tr key={j.id} className="hover:bg-brand-soft">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/admin/jobs/${j.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {j.ref}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{j.trade}</td>
                    <td className="px-4 py-3">{j.area}</td>
                    <td className="max-w-xs truncate px-4 py-3" title={j.description}>
                      {j.description}
                    </td>
                    <td className="px-4 py-3">
                      {formatDay(j.preferredDate)} · {WINDOW_SHORT[j.timeWindow]}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={waitedMin > 120 ? 'warning' : 'neutral'}>
                        {since(j.statusSince, now)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
