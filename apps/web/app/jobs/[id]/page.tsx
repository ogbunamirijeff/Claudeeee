import type { JobView, MeResponse } from '@jiko/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { ApiError, apiGet } from '@/lib/api';
import { JobDetail } from './JobDetail';

export const metadata: Metadata = { title: 'Job' };

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; paid?: string }>;
}) {
  const { id } = await params;
  const { created, paid } = await searchParams;
  const me = await apiGet<MeResponse>('/v1/me');
  let job: JobView;
  try {
    job = await apiGet<JobView>(`/v1/jobs/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <AppHeader isAdmin={me.roles.includes('ADMIN')} />
      <JobDetail job={job} justCreated={created === '1'} justPaid={paid === '1'} />
    </>
  );
}
