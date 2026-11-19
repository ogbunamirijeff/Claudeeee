/**
 * Offer deadlines count only working time: 07:00–20:00 local time in the market's time zone
 * (Houston pilot: America/Chicago, which observes daylight saving), every day. An offer made
 * outside the window starts counting at the next 07:00.
 *
 * DST changes happen at 02:00 local, outside the window, so every working day is 13 hours.
 */
export const MARKET_TIMEZONE = 'America/Chicago';
export const WORKDAY_OPEN_HOUR = 7;
export const WORKDAY_CLOSE_HOUR = 20;
export const OFFER_RESPONSE_WORKING_MINUTES = 120;

const MIN_MS = 60_000;

interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
export function localParts(ms: number, timeZone: string): LocalParts {
  const p = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** UTC offset (ms) of a time zone at an instant; e.g. −5h for Houston in summer. */
function offsetMs(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/** Instant for a local wall-clock time (valid for times that exist; 07:00/20:00 always do). */
export function zonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

function dayBounds(ms: number, timeZone: string) {
  const p = localParts(ms, timeZone);
  return {
    open: zonedTime(p.year, p.month, p.day, WORKDAY_OPEN_HOUR, 0, timeZone),
    close: zonedTime(p.year, p.month, p.day, WORKDAY_CLOSE_HOUR, 0, timeZone),
    nextOpen: (() => {
      const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
      return zonedTime(
        next.getUTCFullYear(),
        next.getUTCMonth() + 1,
        next.getUTCDate(),
        WORKDAY_OPEN_HOUR,
        0,
        timeZone,
      );
    })(),
  };
}

export function addWorkingMinutes(
  at: Date,
  minutes: number,
  timeZone: string = MARKET_TIMEZONE,
): Date {
  if (!Number.isInteger(minutes) || minutes < 0)
    throw new RangeError('minutes must be a non-negative integer');
  let cursor = at.getTime();
  let remaining = minutes * MIN_MS;
  for (;;) {
    const { open, close, nextOpen } = dayBounds(cursor, timeZone);
    if (cursor < open) cursor = open;
    if (cursor >= close) {
      cursor = nextOpen;
      continue;
    }
    const available = close - cursor;
    if (remaining <= available) return new Date(cursor + remaining);
    remaining -= available;
    cursor = nextOpen;
  }
}

export const offerExpiresAt = (offeredAt: Date, timeZone: string = MARKET_TIMEZONE) =>
  addWorkingMinutes(offeredAt, OFFER_RESPONSE_WORKING_MINUTES, timeZone);

/** Today's date in the market as YYYY-MM-DD. */
export function marketDateString(
  at: Date = new Date(),
  timeZone: string = MARKET_TIMEZONE,
): string {
  const p = localParts(at.getTime(), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
