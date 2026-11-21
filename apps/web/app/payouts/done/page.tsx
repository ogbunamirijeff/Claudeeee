export const metadata = { title: 'Payout setup' };

/** Stripe Connect returns here after onboarding. */
export default function PayoutsDone() {
  return (
    <main className="mx-auto max-w-sm space-y-3 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">Payout details saved</h1>
      <p className="text-muted">
        Return to the Jiko app. If Stripe needs anything else, you&apos;ll see it there.
      </p>
    </main>
  );
}
