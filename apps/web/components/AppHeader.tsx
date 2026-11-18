import Link from 'next/link';
import { Logo } from './Logo';
import { LogoutButton } from './LogoutButton';

export function AppHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/jobs" aria-label="Jiko home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/jobs" className="text-muted hover:text-ink">
            My jobs
          </Link>
          {isAdmin && (
            <Link href="/admin" className="text-muted hover:text-ink">
              Ops
            </Link>
          )}
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
