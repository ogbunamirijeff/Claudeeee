/**
 * Anti-leakage: before a job is paid, contact details in chat are hidden and the message is
 * flagged for ops. Deliberately broad — a false positive costs a re-phrase, a miss costs a
 * job leaving the platform.
 */
export const MASK_TOKEN = '[hidden until payment]';

const PATTERNS: RegExp[] = [
  // Emails
  /[A-Z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Z0-9.-]+\s*(?:\.|\(dot\)|\[dot\])\s*[A-Z]{2,}/gi,
  // Any run of 7+ digits, allowing spaces, dashes, dots, brackets and a leading + (phones, bank accounts)
  /\+?\d(?:[\s\-.()]*\d){6,}/g,
  // Numbers spelled out: "zero eight zero three one two three…"
  /\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[\s,.-]*){6,}/gi,
  // Social handles
  /(?:^|\s)@[A-Za-z0-9_.]{3,}/g,
  /\b(?:wa\.me|t\.me|instagram\.com|facebook\.com|fb\.me)\/\S+/gi,
];

const SOLICIT =
  /\b(?:whats\s?app|watsapp|wa\b|call me|text me|my (?:number|line|account)|pay (?:me )?(?:directly|cash|outside)|bank transfer|send (?:me )?(?:your|ur) (?:number|digits))\b/i;

export interface MaskResult {
  text: string;
  masked: boolean;
  /** True when contact details were masked or the text tries to move the job off-platform. */
  flagged: boolean;
}

export function maskContactInfo(input: string): MaskResult {
  let text = input;
  for (const p of PATTERNS) {
    text = text.replace(p, (m) =>
      m.startsWith(' ') || m.startsWith('\n') ? `${m[0]}${MASK_TOKEN}` : MASK_TOKEN,
    );
  }
  const masked = text !== input;
  return { text, masked, flagged: masked || SOLICIT.test(input) };
}
