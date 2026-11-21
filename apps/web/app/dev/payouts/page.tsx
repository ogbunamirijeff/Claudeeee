'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Banner, btn } from '@/components/ui';
import { api, errorMessage } from '@/lib/client-api';

/** Development stand-in for Stripe Connect Express onboarding (PAYMENTS_PROVIDER=fake). */
function FakeOnboarding() {
  const account = useSearchParams().get('account') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function finish() {
    try {
      await api('/dev/payments/payouts/enable', { method: 'POST', body: { accountId: account } });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <main className="mx-auto max-w-sm space-y-4 px-6 py-16">
      <Banner tone="warning">
        Test mode — in production Stripe collects identity, bank and tax details here.
      </Banner>
      <h1 className="text-xl font-semibold">Payout setup</h1>
      {done ? (
        <p>Payouts are on. Return to the Jiko app.</p>
      ) : (
        <button className={btn.primary} disabled={!account} onClick={() => void finish()}>
          Finish setup with test bank account
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <FakeOnboarding />
    </Suspense>
  );
}
