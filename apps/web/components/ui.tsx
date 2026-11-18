import type { ReactNode } from 'react';
import type { Tone } from '@/lib/labels';

/** Small primitives mirroring the Figma components (Button, StatusBadge, Card). */
const TONES: Record<Tone, string> = {
  neutral: 'bg-brand-soft text-muted',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  danger: 'bg-warning-soft text-danger',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: 'warning' | 'success' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg px-3 py-2.5 text-sm font-medium ${TONES[tone]}`}>{children}</div>
  );
}

export const btn = {
  primary:
    'inline-flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 font-medium text-brand-fg disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex w-full items-center justify-center rounded-lg border border-line bg-surface px-4 py-3 font-medium text-ink disabled:opacity-50',
  small:
    'inline-flex items-center justify-center rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-50',
  smallSecondary:
    'inline-flex items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50',
};

export const input =
  'w-full rounded-lg border border-line bg-surface px-4 py-3 text-base outline-none focus:border-ink focus:ring-1 focus:ring-ink';
