/**
 * US mobile numbers (North American Numbering Plan). Canonical storage format is E.164:
 * +1NXXNXXXXXX — a 3-digit area code and 3-digit exchange that both start with 2–9.
 */
const NSN_PATTERN = /^[2-9]\d{2}[2-9]\d{6}$/;

/** Returns the E.164 form, or null if the input is not a valid US number. */
export function normalizePhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const hadPlus = input.trim().startsWith('+');
  let digits = input.replace(/[\s\-.()]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');

  let nsn: string;
  if (digits.length === 11 && digits.startsWith('1')) nsn = digits.slice(1);
  else if (!hadPlus && digits.length === 10) nsn = digits;
  else return null;

  // N11 codes (211, 311, 411, 911…) are service codes, never area codes or exchanges.
  if (!NSN_PATTERN.test(nsn) || nsn.slice(1, 3) === '11' || nsn.slice(4, 6) === '11') return null;
  return `+1${nsn}`;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** "+17135550123" → "+1 (713) •••-••23". Used whenever the other party hasn't paid yet. */
export function maskPhone(e164: string): string {
  const n = normalizePhone(e164);
  if (!n) return '•••';
  return `+1 (${n.slice(2, 5)}) •••-••${n.slice(10)}`;
}

/** "+17135550123" → "(713) 555-0123" for display. */
export function formatPhone(e164: string): string {
  const n = normalizePhone(e164);
  if (!n) return e164;
  return `(${n.slice(2, 5)}) ${n.slice(5, 8)}-${n.slice(8)}`;
}
