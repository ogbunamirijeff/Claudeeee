import { formatPhone } from '@jiko/shared/phone';
import type { CandidateView, JobView } from '@jiko/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Chat } from '@/components/Chat';
import { QuoteCard } from '@/components/QuoteCard';
import { Badge, Card } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api';
import { formatDay, JOB_STATUS_LABEL, JOB_STATUS_TONE, TIME_WINDOW } from '@/lib/labels';
import { AdminJobActions } from './AdminJobActions';

export const metadata: Metadata = { title: 'Job' };
export const dynamic = 'force-dynamic';

export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let job: JobView;
  try {
    job = await apiGet<JobView>(`/v1/jobs/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const candidates =
    job.status === 'PENDING_ASSIGNMENT'
      ? await apiGet<CandidateView[]>(`/v1/admin/jobs/${job.id}/candidates`)
      : [];

  return (
    <main className="grid gap-6 p-4 md:p-7 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">
            {job.ref} · {job.trade.name} · {job.area.name}
          </h1>
          <Badge tone={JOB_STATUS_TONE[job.status]}>
            {JOB_STATUS_LABEL[job.status] ?? job.status}
          </Badge>
        </div>
        <Card className="space-y-2 text-sm">
          <p>{job.description}</p>
          <p className="text-muted">
            {job.addressLine}
            {`, ${job.postalCode}`}
            {job.accessNotes ? ` · ${job.accessNotes}` : ''}
          </p>
          <p className="text-muted">
            {formatDay(job.preferredDate)}, {TIME_WINDOW[job.timeWindow]} · Client:{' '}
            {job.client.name ?? '—'} · {formatPhone(job.client.phone)}
          </p>
          {job.photos.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {job.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <img
                    src={p.url}
                    alt={p.kind}
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </Card>
        {job.artisan && (
          <Card className="text-sm">
            <p className="font-semibold">
              {job.artisan.name}{' '}
              {job.offer?.status === 'OFFERED' && (
                <Badge tone="warning">
                  Offered · expires{' '}
                  {job.offer.expiresAt
                    ? new Date(job.offer.expiresAt).toLocaleTimeString('en-US', {
                        timeZone: 'America/Chicago',
                        timeStyle: 'short',
                      })
                    : '—'}
                </Badge>
              )}
            </p>
            <p className="text-muted">
              {formatPhone(job.artisan.phone)} · ★ {job.artisan.ratingAvg.toFixed(1)} ·{' '}
              {job.artisan.jobsCompleted} jobs
            </p>
          </Card>
        )}
        {job.quote && <QuoteCard quote={job.quote} showSplit />}
        {job.artisan && job.offer?.status === 'ACCEPTED' && <Chat jobId={job.id} admin />}
        <details className="text-sm" open>
          <summary className="cursor-pointer font-semibold">History</summary>
          <ol className="mt-2 space-y-1">
            {job.timeline.map((t, i) => (
              <li key={i} className="text-muted">
                {new Date(t.at).toLocaleString('en-US', {
                  timeZone: 'America/Chicago',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}{' '}
                — {JOB_STATUS_LABEL[t.to] ?? t.to}
                {t.note ? ` (${t.note})` : ''}
              </li>
            ))}
          </ol>
        </details>
      </section>
      <aside className="space-y-4">
        <AdminJobActions
          jobId={job.id}
          status={job.status}
          actions={job.actions}
          candidates={candidates}
          tradeName={job.trade.name}
          areaName={job.area.name}
        />
      </aside>
    </main>
  );
}
