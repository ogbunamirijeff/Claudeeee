export const metadata = { title: 'Payout setup' };

/** Stripe Connect sends people here when an onboarding link has expired. */
export default function PayoutsRefresh() {
  return (
    <main className="mx-auto max-w-sm space-y-3 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">That link expired</h1>
      <p className="text-muted">
        Open the Jiko app and tap “Set up payouts” again to get a fresh link.
      </p>
    </main>
  );
}
