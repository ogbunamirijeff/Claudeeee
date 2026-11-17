import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Logo } from '@/components/Logo';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <Logo className="mb-8 text-2xl" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
