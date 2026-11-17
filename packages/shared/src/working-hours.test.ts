import { addWorkingMinutes, lagosDateString, offerExpiresAt } from './working-hours';

// Helper: WAT wall-clock → Date (WAT = UTC+1)
const wat = (s: string) => new Date(`${s}+01:00`);
const iso = (d: Date) => d.toISOString();

describe('offer expiry in working hours (07:00–20:00 WAT)', () => {
  it.each([
    ['inside the window', '2026-11-18T10:00:00', '2026-11-18T12:00:00'],
    ['ending exactly at close', '2026-11-18T18:00:00', '2026-11-18T20:00:00'],
    ['spanning the evening close', '2026-11-18T19:30:00', '2026-11-19T08:30:00'],
    ['made after hours', '2026-11-18T21:15:00', '2026-11-19T09:00:00'],
    ['made exactly at close', '2026-11-18T20:00:00', '2026-11-19T09:00:00'],
    ['made before opening', '2026-11-19T05:40:00', '2026-11-19T09:00:00'],
    ['made at midnight', '2026-11-19T00:00:00', '2026-11-19T09:00:00'],
    ['keeps seconds', '2026-11-18T10:00:30', '2026-11-18T12:00:30'],
  ])('%s', (_, offered, expires) => {
    expect(iso(offerExpiresAt(wat(offered)))).toBe(iso(wat(expires)));
  });

  it('spans multiple days for long durations', () => {
    // 13h working day: 20h of work from 07:00 → next day 14:00
    expect(iso(addWorkingMinutes(wat('2026-11-18T07:00:00'), 20 * 60))).toBe(
      iso(wat('2026-11-19T14:00:00')),
    );
  });

  it('gives Lagos dates (UTC+1)', () => {
    expect(lagosDateString(new Date('2026-11-18T23:30:00Z'))).toBe('2026-11-19');
    expect(lagosDateString(new Date('2026-11-18T22:59:00Z'))).toBe('2026-11-18');
  });
});
