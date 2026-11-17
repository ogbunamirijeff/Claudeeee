import type { MeResponse } from '@jiko/shared';
import { formatNgPhone } from '@jiko/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { LogoutButton } from '@/components/LogoutButton';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  const me = await apiGet<MeResponse>('/v1/me');
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Logo />
        <LogoutButton />
      </header>
      <h1 className="text-2xl font-semibold">
        {me.name ? `Hello, ${me.name.split(' ')[0]}` : 'Welcome to Jiko'}
      </h1>
      <dl className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface">
        <Row label="Phone" value={formatNgPhone(me.phone)} />
        <Row label="Roles" value={me.roles.map((r) => r.toLowerCase()).join(', ')} />
        <Row
          label="Member since"
          value={new Date(me.createdAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
        />
      </dl>
      {me.roles.includes('ADMIN') && (
        <Link
          href="/admin"
          className="mt-6 block rounded-lg bg-brand px-4 py-3 text-center font-medium text-brand-fg"
        >
          Open admin dashboard
        </Link>
      )}
      <p className="mt-8 text-sm text-muted">Booking a job arrives in the next release.</p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
