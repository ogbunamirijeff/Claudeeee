import { Logger } from '@nestjs/common';
import type { SmsMessage, SmsProvider } from './sms.provider';

/** Development only: prints messages (including OTP codes) to the API log. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS');

  send(msg: SmsMessage) {
    this.logger.warn(`[dev sms] to ${msg.to}: ${msg.body}`);
    return Promise.resolve({ providerMessageId: null });
  }
}
