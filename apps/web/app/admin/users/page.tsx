import { formatPhone } from '@jiko/shared/phone';
import type { Metadata } from 'next';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

interface AdminUser {
  id: string;
  phone: string;
  name: string | null;
  roles: string[];
  status: string;
  createdAt: string;
}

export default async function UsersPage() {
  const users = await apiGet<{ items: AdminUser[] }>('/v1/admin/users?take=50');
  return (
    <main className="space-y-4 p-4 md:p-7">
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr>
              {['Name', 'Phone', 'Roles', 'Status', 'Joined'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.items.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.name ?? '—'}</td>
                <td className="px-4 py-3 tabular-nums">{formatPhone(u.phone)}</td>
                <td className="px-4 py-3">{u.roles.map((r) => r.toLowerCase()).join(', ')}</td>
                <td className="px-4 py-3">{u.status.toLowerCase()}</td>
                <td className="px-4 py-3 tabular-nums">
                  {new Date(u.createdAt).toLocaleDateString('en-US')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
