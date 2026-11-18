import type { JobCardView, MeResponse } from '@jiko/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { Badge, btn } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { formatDay, JOB_STATUS_LABEL, JOB_STATUS_TONE } from '@/lib/labels';

export const metadata: Metadata = { title: 'My jobs' };

export default async function JobsPage() {
  const [me, jobs] = await Promise.all([
    apiGet<MeResponse>('/v1/me'),
    apiGet<JobCardView[]>('/v1/jobs'),
  ]);
  return (
    <>
      <AppHeader isAdmin={me.roles.includes('ADMIN')} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">My jobs</h1>
          <Link href="/book" className={`${btn.small} w-auto`}>
            Book a job
          </Link>
        </div>
        {jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
            No jobs yet. Book a vetted plumber, electrician or AC technician.
          </p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className="block rounded-xl border border-line bg-surface p-4 hover:border-muted"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">
                      {j.trade} · {j.area}
                    </span>
                    <Badge tone={JOB_STATUS_TONE[j.status]}>
                      {JOB_STATUS_LABEL[j.status] ?? j.status}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{j.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    {j.ref} · {formatDay(j.preferredDate)}
                    {j.artisanName ? ` · ${j.artisanName}` : ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
