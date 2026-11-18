export const JOB_STATUS_LABEL: Record<string, string> = {
  PENDING_ASSIGNMENT: 'Finding an artisan',
  ASSIGNED: 'Offered to artisan',
  ACCEPTED: 'Artisan assigned',
  QUOTED: 'Quote ready',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid · scheduled',
  IN_PROGRESS: 'In progress',
  WORK_SUBMITTED: 'Work done · confirm',
  COMPLETED: 'Completed',
  DISPUTED: 'In dispute',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
  OFFERED: 'New offer',
};

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export const JOB_STATUS_TONE: Record<string, Tone> = {
  PENDING_ASSIGNMENT: 'info',
  ASSIGNED: 'warning',
  ACCEPTED: 'info',
  QUOTED: 'info',
  AWAITING_PAYMENT: 'warning',
  PAID: 'success',
  IN_PROGRESS: 'info',
  WORK_SUBMITTED: 'warning',
  COMPLETED: 'success',
  DISPUTED: 'danger',
  REFUNDED: 'neutral',
  CANCELLED: 'neutral',
  OFFERED: 'warning',
};

export const TIME_WINDOW: Record<string, string> = {
  MORNING: 'Morning · 8–12',
  AFTERNOON: 'Afternoon · 12–4',
  EVENING: 'Evening · 4–7',
};

export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  });
}

export function since(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}
