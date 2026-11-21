'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminNav({ counts }: { counts: { queue: number; reviews: number } }) {
  const path = usePathname();
  const items = [
    { href: '/admin', label: 'Request queue', count: counts.queue },
    { href: '/admin/pipeline', label: 'Job pipeline' },
    { href: '/admin/reviews', label: 'Quotes to review', count: counts.reviews },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/users', label: 'Users' },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
      {items.map((i) => {
        const active =
          i.href === '/admin'
            ? path === '/admin' || path.startsWith('/admin/jobs')
            : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-brand-soft font-semibold text-ink' : 'text-muted hover:text-ink'}`}
          >
            {i.label}
            {!!i.count && (
              <span className="rounded-full bg-info-soft px-2 text-xs font-medium text-info">
                {i.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
