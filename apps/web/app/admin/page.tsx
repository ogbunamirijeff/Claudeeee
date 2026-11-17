import type { MeResponse } from '@jiko/shared';
import { formatNgPhone } from '@jiko/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/components/LogoutButton';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = { title: 'Admin' };

interface AdminUser {
  id: string;
  phone: string;
  name: string | null;
  roles: string[];
  status: string;
  createdAt: string;
}

export default async function AdminPage() {
  const me = await apiGet<MeResponse>('/v1/me');
  if (!me.roles.includes('ADMIN')) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <p className="mt-2 text-muted">Your account doesn&apos;t have access to the admin dashboard.</p>
        <Link className="mt-6 inline-block underline" href="/account">Back to your account</Link>
      </main>
    );
  }
  // The API enforces ADMIN on this endpoint as well; the check above is only for a friendly page.
  const users = await apiGet<{ items: AdminUser[] }>('/v1/admin/users?take=25');

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-medium text-muted">Ops</span>
        </div>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-muted">Request queue, job pipeline, verification and payments arrive in later phases.</p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.name ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNgPhone(u.phone)}</td>
                  <td className="px-4 py-3">{u.roles.map((r) => r.toLowerCase()).join(', ')}</td>
                  <td className="px-4 py-3">{u.status.toLowerCase()}</td>
                  <td className="px-4 py-3 tabular-nums">{new Date(u.createdAt).toLocaleDateString('en-NG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
