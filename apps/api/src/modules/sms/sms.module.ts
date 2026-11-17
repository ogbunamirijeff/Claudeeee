import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ConsoleSmsProvider } from './console.provider';
import { SMS_PROVIDER, SmsProvider } from './sms.provider';
import { TermiiSmsProvider } from './termii.provider';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): SmsProvider =>
        env.SMS_PROVIDER === 'termii'
          ? new TermiiSmsProvider({
              baseUrl: env.TERMII_BASE_URL,
              apiKey: env.TERMII_API_KEY!,
              senderId: env.TERMII_SENDER_ID,
              channel: env.TERMII_CHANNEL,
            })
          : new ConsoleSmsProvider(),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
