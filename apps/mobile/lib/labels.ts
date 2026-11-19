import { MARKET_TIMEZONE } from '@jiko/shared';

export const STATUS_LABEL: Record<string, string> = {
  PENDING_ASSIGNMENT: 'Finding a pro',
  ASSIGNED: 'Offered to pro',
  OFFERED: 'New offer',
  ACCEPTED: 'Pro assigned',
  QUOTED: 'Quote ready',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid · scheduled',
  IN_PROGRESS: 'In progress',
  WORK_SUBMITTED: 'Work done · confirm',
  COMPLETED: 'Completed',
  DISPUTED: 'In dispute',
  REFUNDED: 'Refunded',
  CANCELLED: 'Canceled',
};

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export const STATUS_TONE: Record<string, Tone> = {
  PENDING_ASSIGNMENT: 'info',
  ASSIGNED: 'warning',
  OFFERED: 'warning',
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
};

export const TIME_WINDOW: Record<string, string> = {
  MORNING: 'Morning · 8–12',
  AFTERNOON: 'Afternoon · 12–4',
  EVENING: 'Evening · 4–7',
};

export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: MARKET_TIMEZONE,
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: MARKET_TIMEZONE,
  });
}
