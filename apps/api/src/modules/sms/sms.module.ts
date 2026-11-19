import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ConsoleSmsProvider } from './console.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms.provider';
import { TwilioSmsProvider } from './twilio.provider';

@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env): SmsProvider =>
        env.SMS_PROVIDER === 'twilio'
          ? new TwilioSmsProvider({
              accountSid: env.TWILIO_ACCOUNT_SID!,
              authToken: env.TWILIO_AUTH_TOKEN!,
              messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
              fromNumber: env.TWILIO_FROM_NUMBER,
            })
          : new ConsoleSmsProvider(),
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
