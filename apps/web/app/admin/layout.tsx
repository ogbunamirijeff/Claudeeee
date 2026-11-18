import type { MeResponse } from '@jiko/shared';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/components/LogoutButton';
import { apiGet } from '@/lib/api';
import { AdminNav } from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await apiGet<MeResponse>('/v1/me');
  if (!me.roles.includes('ADMIN')) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <p className="mt-2 text-muted">
          Your account doesn&apos;t have access to the ops dashboard.
        </p>
        <Link className="mt-6 inline-block underline" href="/jobs">
          Back to your jobs
        </Link>
      </main>
    );
  }
  const summary = await apiGet<{ byStatus: Record<string, number>; pendingQuoteReviews: number }>(
    '/v1/admin/jobs/summary',
  );
  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:w-52 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2">
            <Logo />
            <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-medium text-muted">
              Ops
            </span>
          </span>
          <span className="md:hidden">
            <LogoutButton />
          </span>
        </div>
        <AdminNav
          counts={{
            queue: summary.byStatus.PENDING_ASSIGNMENT ?? 0,
            reviews: summary.pendingQuoteReviews,
          }}
        />
        <div className="hidden px-4 py-4 md:block">
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
