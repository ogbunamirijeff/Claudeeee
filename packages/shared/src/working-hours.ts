/**
 * Offer deadlines count only working time: 07:00–20:00 West Africa Time (UTC+1, no DST),
 * every day. An offer made outside the window starts counting at the next 07:00.
 */
const WAT_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
export const WORKDAY_OPEN_MIN = 7 * 60;
export const WORKDAY_CLOSE_MIN = 20 * 60;
export const OFFER_RESPONSE_WORKING_MINUTES = 120;

export function addWorkingMinutes(at: Date, minutes: number): Date {
  if (!Number.isInteger(minutes) || minutes < 0)
    throw new RangeError('minutes must be a non-negative integer');
  const open = WORKDAY_OPEN_MIN * MIN_MS;
  const close = WORKDAY_CLOSE_MIN * MIN_MS;

  let local = at.getTime() + WAT_OFFSET_MS; // "WAT wall-clock" milliseconds
  let dayStart = local - (((local % DAY_MS) + DAY_MS) % DAY_MS);
  const sinceMidnight = local - dayStart;
  if (sinceMidnight < open) local = dayStart + open;
  else if (sinceMidnight >= close) {
    dayStart += DAY_MS;
    local = dayStart + open;
  }

  let remaining = minutes * MIN_MS;
  for (;;) {
    const availableToday = dayStart + close - local;
    if (remaining <= availableToday) return new Date(local + remaining - WAT_OFFSET_MS);
    remaining -= availableToday;
    dayStart += DAY_MS;
    local = dayStart + open;
  }
}

export const offerExpiresAt = (offeredAt: Date) =>
  addWorkingMinutes(offeredAt, OFFER_RESPONSE_WORKING_MINUTES);

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosDateString(at: Date = new Date()): string {
  return new Date(at.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}
