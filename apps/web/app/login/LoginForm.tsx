'use client';

import type { ApiErrorBody } from '@jiko/shared';
import { formatPhone, normalizePhone } from '@jiko/shared/phone';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

type Step = 'phone' | 'code';

class RequestFailed extends Error {
  constructor(public readonly body: Partial<ApiErrorBody>) {
    super(body.message ?? 'Request failed');
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new RequestFailed(data as Partial<ApiErrorBody>);
  return data as T;
}

const input =
  'w-full rounded-lg border border-line bg-surface px-4 py-3 text-lg outline-none focus:border-ink focus:ring-1 focus:ring-ink';
const primary =
  'w-full rounded-lg bg-brand px-4 py-3 font-medium text-brand-fg disabled:cursor-not-allowed disabled:opacity-50';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const normalized = normalizePhone(phoneInput);
    if (!normalized) return setError('Enter a valid US mobile number, e.g. (713) 555-0123');
    if (!accepted) return setError('Please accept the Terms and Privacy Policy to continue');
    setBusy(true);
    try {
      const r = await post<{ resendAfterSeconds: number }>('/api/auth/request-otp', {
        phone: normalized,
      });
      setPhone(normalized);
      setStep('code');
      setResendIn(r.resendAfterSeconds);
    } catch (err) {
      setError(err instanceof RequestFailed ? err.message : 'Could not send the code');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post('/api/auth/verify', { phone, code, acceptTerms: accepted });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/jobs');
      router.refresh();
    } catch (err) {
      setError(err instanceof RequestFailed ? err.message : 'Could not verify the code');
      setBusy(false);
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} className="space-y-5" noValidate>
        <div>
          <h1 className="text-2xl font-semibold">Sign in or create an account</h1>
          <p className="mt-1 text-muted">We&apos;ll text you a 6-digit code.</p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Phone number</span>
          <input
            className={input}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(713) 555-0123"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
          />
        </label>
        <label className="flex items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            I agree to Jiko&apos;s{' '}
            <a className="underline" href="/terms">
              Terms
            </a>{' '}
            and{' '}
            <a className="underline" href="/privacy">
              Privacy Policy
            </a>
            , and to receive account and job texts from Jiko at this number. Msg &amp; data rates
            may apply. Reply STOP to opt out.
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button className={primary} disabled={busy}>
          {busy ? 'Sending…' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Enter your code</h1>
        <p className="mt-1 text-muted">Sent to {formatPhone(phone)}.</p>
      </div>
      <input
        className={`${input} text-center tracking-[0.5em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="••••••"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        autoFocus
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button className={primary} disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : 'Continue'}
      </button>
      <div className="flex justify-between text-sm">
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline"
          onClick={() => {
            setStep('phone');
            setCode('');
            setError(null);
          }}
        >
          Change number
        </button>
        <button
          type="button"
          className="text-muted underline-offset-4 hover:underline disabled:no-underline disabled:opacity-50"
          disabled={resendIn > 0 || busy}
          onClick={() => sendCode()}
        >
          {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}
