'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Banner, btn } from '@/components/ui';
import { api, errorMessage } from '@/lib/client-api';

/** Development stand-in for Stripe Checkout (PAYMENTS_PROVIDER=fake). The API refuses it otherwise. */
function FakeCheckout() {
  const router = useRouter();
  const session = useSearchParams().get('session') ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pay() {
    setBusy(true);
    try {
      const { jobId } = await api<{ jobId: string }>('/dev/payments/checkout/complete', {
        method: 'POST',
        body: { sessionId: session },
      });
      router.replace(`/jobs/${jobId}?paid=1`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-sm space-y-4 px-6 py-16">
      <Banner tone="warning">
        Test mode — no real card is charged. In production this is Stripe&apos;s secure checkout
        page.
      </Banner>
      <h1 className="text-xl font-semibold">Test checkout</h1>
      <p className="break-all text-xs text-muted">{session}</p>
      <button className={btn.primary} disabled={busy || !session} onClick={() => void pay()}>
        {busy ? 'Processing…' : 'Pay with test card 4242'}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <FakeCheckout />
    </Suspense>
  );
}
