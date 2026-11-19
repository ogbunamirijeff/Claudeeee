'use client';

import { marketDateString, SERVICE_ZIP_PATTERN, type JobView } from '@jiko/shared';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Banner, btn, Card, input } from '@/components/ui';
import { api, compressImage, errorMessage, uploadPhoto } from '@/lib/client-api';
import { formatDay, TIME_WINDOW } from '@/lib/labels';

type Option = { id: string; slug: string; name: string };
type Photo = { id: string; preview: string };

const HINTS: Record<string, string> = {
  plumbing: 'Leaks, clogs, water heaters, toilets',
  electrical: 'Outlets, breakers, fans, generator hookups',
  hvac: 'AC not cooling, furnace, tune-ups, thermostats',
};
const STEPS = ['Book a job', 'Describe the problem', 'Where and when', 'Review'];

function nextDays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(marketDateString(new Date(Date.now() + i * 86_400_000)));
  return out;
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-sm font-medium ${selected ? 'border-brand bg-brand text-brand-fg' : 'border-line bg-surface text-ink'}`}
    >
      {children}
    </button>
  );
}

export function BookingWizard({ trades, areas }: { trades: Option[]; areas: Option[] }) {
  const router = useRouter();
  const days = useMemo(() => nextDays(7), []);
  const [step, setStep] = useState(0);
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [addressLine, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [day, setDay] = useState(days[1]);
  const [timeWindow, setWindow] = useState<'MORNING' | 'AFTERNOON' | 'EVENING'>('MORNING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trade = trades.find((t) => t.id === tradeId);
  const area = areas.find((a) => a.id === areaId);
  const canNext = [
    !!tradeId,
    description.trim().length >= 10 && uploading === 0,
    !!areaId && addressLine.trim().length >= 5 && SERVICE_ZIP_PATTERN.test(postalCode),
    true,
  ][step];

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files).slice(0, 5 - photos.length)) {
      setUploading((n) => n + 1);
      try {
        const blob = await compressImage(file);
        const id = await uploadPhoto(blob, 'JOB_REQUEST_PHOTO');
        setPhotos((p) => [...p, { id, preview: URL.createObjectURL(blob) }]);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const job = await api<JobView>('/jobs', {
        method: 'POST',
        body: {
          tradeId,
          areaId,
          description,
          addressLine,
          postalCode,
          accessNotes: accessNotes || undefined,
          preferredDate: day,
          timeWindow,
          photoFileIds: photos.map((p) => p.id),
        },
      });
      router.replace(`/jobs/${job.id}?created=1`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 px-4 py-4">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (step ? setStep(step - 1) : router.push('/jobs'))}
          className="-ml-1 p-1"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="flex-1 font-semibold">
          {step === 0 ? STEPS[0] : (trade?.name ?? STEPS[step])}
        </span>
        <span className="text-sm text-muted">Step {step + 1} of 4</span>
      </header>

      <main className="flex-1 space-y-4 px-6 pb-6">
        {step === 0 && (
          <>
            <h1 className="text-2xl font-semibold">What do you need help with?</h1>
            <p className="text-sm text-muted">
              Every artisan on Jiko has passed our 6-step Craft Seal check.
            </p>
            <div className="space-y-3" role="radiogroup">
              {trades.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tradeId === t.id}
                  onClick={() => setTradeId(t.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left ${tradeId === t.id ? 'border-2 border-brand' : 'border-line'}`}
                >
                  <Image
                    src={`/trades/${t.slug}.webp`}
                    alt=""
                    width={64}
                    height={64}
                    className="rounded-lg"
                  />
                  <span>
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block text-sm text-muted">{HINTS[t.slug]}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold">Tell us what&apos;s wrong</h1>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Describe the problem</span>
              <textarea
                className={`${input} min-h-32`}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Kitchen sink is leaking under the cabinet"
              />
              <span className="block text-xs text-muted">{description.length} / 1000</span>
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium">Photos (optional, up to 5)</span>
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <img
                    key={p.id}
                    src={p.preview}
                    alt=""
                    className="h-22 w-22 rounded-lg object-cover"
                    width={88}
                    height={88}
                  />
                ))}
                {photos.length + uploading < 5 && (
                  <label className="flex h-[88px] w-[88px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-muted text-sm font-medium text-muted">
                    {uploading ? 'Uploading…' : '+ Add'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => void addPhotos(e.target.files)}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted">
                Photos are shrunk on your phone before upload to save data.
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold">Where and when?</h1>
            <div className="space-y-2">
              <span className="text-sm font-medium">Area</span>
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => (
                  <Chip key={a.id} selected={areaId === a.id} onClick={() => setAreaId(a.id)}>
                    {a.name}
                  </Chip>
                ))}
              </div>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Address</span>
              <input
                className={input}
                value={addressLine}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                placeholder="1234 Yale St, Apt 2"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">ZIP code</span>
              <input
                className={input}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="77008"
              />
              {postalCode.length === 5 && !SERVICE_ZIP_PATTERN.test(postalCode) && (
                <span className="block text-xs text-danger">
                  Jiko serves the Houston area for now.
                </span>
              )}
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Access notes (optional)</span>
              <input
                className={input}
                value={accessNotes}
                onChange={(e) => setAccessNotes(e.target.value)}
                maxLength={200}
                placeholder="Gate code, parking, pets"
              />
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium">Day</span>
              <div className="flex flex-wrap gap-2">
                {days.map((d, i) => (
                  <Chip key={d} selected={day === d} onClick={() => setDay(d)}>
                    {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDay(d)}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">Time window</span>
              <div className="flex flex-wrap gap-2">
                {Object.keys(TIME_WINDOW).map((w) => (
                  <Chip
                    key={w}
                    selected={timeWindow === w}
                    onClick={() => setWindow(w as typeof timeWindow)}
                  >
                    {TIME_WINDOW[w]}
                  </Chip>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted">
              Your full address and access notes are shared with the artisan only after they accept
              the job.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-semibold">Check your request</h1>
            <Card>
              <dl className="space-y-3 text-sm">
                {[
                  ['Trade', trade?.name],
                  ['Problem', description],
                  ['Photos', photos.length ? `${photos.length} attached` : 'None'],
                  ['Where', `${addressLine}, ${area?.name ?? ''} ${postalCode}`],
                  ['When', `${formatDay(day)}, ${TIME_WINDOW[timeWindow]}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <dt className="w-20 shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0 break-words font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <h2 className="font-semibold">What happens next</h2>
            <ol className="space-y-3 text-sm">
              {[
                'Jiko assigns a Craft Seal artisan near you',
                'They visit or inspect, then send an itemized quote',
                'You approve and pay — Jiko holds the money',
                'The artisan is paid only when you confirm the job is done',
              ].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </>
        )}
        {error && <Banner tone="warning">{error}</Banner>}
      </main>

      <footer className="sticky bottom-0 border-t border-line bg-canvas px-6 pb-6 pt-3">
        {step < 3 ? (
          <button
            type="button"
            className={btn.primary}
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className={btn.primary}
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
        )}
      </footer>
    </div>
  );
}
