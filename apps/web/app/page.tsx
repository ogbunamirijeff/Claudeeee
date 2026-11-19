import Link from 'next/link';
import { Logo } from '@/components/Logo';

// Placeholder — the marketing landing page is built in Phase 6.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <Logo className="text-3xl" />
      <h1 className="text-2xl font-semibold leading-tight">
        Licensed, vetted home pros in Houston.
      </h1>
      <p className="text-muted">
        Plumbers, electricians and HVAC techs with the Craft Seal: licensed, insured and
        background-checked. Clear quotes. Your money is held until the job is done.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-brand px-4 py-3 text-center font-medium text-brand-fg"
      >
        Sign in with your phone
      </Link>
    </main>
  );
}
