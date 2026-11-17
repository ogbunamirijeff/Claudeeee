/**
 * Nigerian mobile numbers. Canonical storage format is E.164: +234XXXXXXXXXX
 * (country code + 10-digit national significant number, which starts 70/80/81/90/91).
 */
const NSN_PATTERN = /^[789][01]\d{8}$/;

/** Returns the E.164 form, or null if the input is not a valid Nigerian mobile number. */
export function normalizeNgPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const hadPlus = input.trim().startsWith('+');
  let digits = input.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');

  let nsn: string;
  if (digits.startsWith('234') && digits.length === 13) nsn = digits.slice(3);
  else if (!hadPlus && digits.startsWith('0') && digits.length === 11) nsn = digits.slice(1);
  else if (!hadPlus && digits.length === 10) nsn = digits;
  else return null;

  return NSN_PATTERN.test(nsn) ? `+234${nsn}` : null;
}

export function isValidNgPhone(input: string): boolean {
  return normalizeNgPhone(input) !== null;
}

/** "+2348031234512" → "+234 80•• ••• •12". Used whenever the other party hasn't paid yet. */
export function maskPhone(e164: string): string {
  const n = normalizeNgPhone(e164);
  if (!n) return '•••';
  const nsn = n.slice(4);
  return `+234 ${nsn.slice(0, 2)}•• ••• •${nsn.slice(8)}`;
}

/** "+2348031234512" → "0803 123 4512" for display. */
export function formatNgPhone(e164: string): string {
  const n = normalizeNgPhone(e164);
  if (!n) return e164;
  const local = `0${n.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Termii expects the number without "+": 2348031234512 */
export function toTermiiFormat(e164: string): string {
  return e164.replace(/^\+/, '');
}
