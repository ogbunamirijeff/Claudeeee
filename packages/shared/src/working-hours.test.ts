import { addWorkingMinutes, marketDateString, offerExpiresAt } from './working-hours';

const iso = (d: Date) => d.toISOString();
// Houston wall-clock → Date. CST = UTC−6 (Nov–Mar), CDT = UTC−5 (Mar–Nov).
const cst = (s: string) => new Date(`${s}-06:00`);
const cdt = (s: string) => new Date(`${s}-05:00`);

describe('offer expiry in working hours (07:00–20:00 Houston time)', () => {
  it.each([
    ['inside the window', cst('2026-11-18T10:00:00'), cst('2026-11-18T12:00:00')],
    ['ending exactly at close', cst('2026-11-18T18:00:00'), cst('2026-11-18T20:00:00')],
    ['spanning the evening close', cst('2026-11-18T19:30:00'), cst('2026-11-19T08:30:00')],
    ['made after hours', cst('2026-11-18T21:15:00'), cst('2026-11-19T09:00:00')],
    ['made exactly at close', cst('2026-11-18T20:00:00'), cst('2026-11-19T09:00:00')],
    ['made before opening', cst('2026-11-19T05:40:00'), cst('2026-11-19T09:00:00')],
    ['made at midnight', cst('2026-11-19T00:00:00'), cst('2026-11-19T09:00:00')],
    ['keeps seconds', cst('2026-11-18T10:00:30'), cst('2026-11-18T12:00:30')],
    ['in summer time (CDT)', cdt('2026-07-01T10:00:00'), cdt('2026-07-01T12:00:00')],
  ])('%s', (_, offered, expires) => {
    expect(iso(offerExpiresAt(offered))).toBe(iso(expires));
  });

  it('handles the spring-forward night (DST starts 2026-03-08)', () => {
    expect(iso(offerExpiresAt(cst('2026-03-07T19:30:00')))).toBe(iso(cdt('2026-03-08T08:30:00')));
  });

  it('handles the fall-back night (DST ends 2026-11-01)', () => {
    expect(iso(offerExpiresAt(cdt('2026-10-31T19:00:00')))).toBe(iso(cst('2026-11-01T08:00:00')));
  });

  it('spans multiple days for long durations', () => {
    // 13h working day: 20h of work from 07:00 → next day 14:00
    expect(iso(addWorkingMinutes(cst('2026-11-18T07:00:00'), 20 * 60))).toBe(
      iso(cst('2026-11-19T14:00:00')),
    );
  });

  it('gives Houston dates', () => {
    expect(marketDateString(new Date('2026-11-19T05:30:00Z'))).toBe('2026-11-18'); // 23:30 CST
    expect(marketDateString(new Date('2026-11-19T06:30:00Z'))).toBe('2026-11-19'); // 00:30 CST
  });
});
