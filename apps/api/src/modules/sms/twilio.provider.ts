import { Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider } from './sms.provider';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** Preferred: a Messaging Service tied to a registered A2P 10DLC campaign or toll-free number. */
  messagingServiceSid?: string;
  fromNumber?: string;
  baseUrl?: string;
}

/** https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  private readonly logger = new Logger('Twilio');

  constructor(
    private readonly cfg: TwilioConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(msg: SmsMessage) {
    const form = new URLSearchParams({ To: msg.to, Body: msg.body });
    if (this.cfg.messagingServiceSid) form.set('MessagingServiceSid', this.cfg.messagingServiceSid);
    else form.set('From', this.cfg.fromNumber!);

    const base = this.cfg.baseUrl ?? 'https://api.twilio.com';
    const auth = Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString('base64');
    const res = await this.fetchImpl(
      `${base}/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };
    if (!res.ok) {
      // Never log the message body: it may contain an OTP.
      this.logger.error(
        `Twilio send failed (${res.status}, code ${data.code ?? '-'}): ${data.message ?? 'unknown error'}`,
      );
      throw new Error(`Twilio send failed with status ${res.status}`);
    }
    return { providerMessageId: data.sid ?? null };
  }
}
