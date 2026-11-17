import { Logger } from '@nestjs/common';
import { toTermiiFormat } from '@jiko/shared';
import type { SmsMessage, SmsProvider } from './sms.provider';

export interface TermiiConfig {
  baseUrl: string;
  apiKey: string;
  senderId: string;
  channel: 'dnd' | 'generic' | 'whatsapp';
}

/** https://developers.termii.com/messaging-api — POST /api/sms/send */
export class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii';
  private readonly logger = new Logger('Termii');

  constructor(
    private readonly cfg: TermiiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(msg: SmsMessage) {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: this.cfg.apiKey,
        to: toTermiiFormat(msg.to),
        from: this.cfg.senderId,
        sms: msg.body,
        type: 'plain',
        channel: msg.transactional ? 'dnd' : this.cfg.channel,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string };
    if (!res.ok) {
      // Never log the message body: it may contain an OTP.
      this.logger.error(`Termii send failed (${res.status}): ${data.message ?? 'unknown error'}`);
      throw new Error(`Termii send failed with status ${res.status}`);
    }
    return { providerMessageId: data.message_id ?? null };
  }
}
