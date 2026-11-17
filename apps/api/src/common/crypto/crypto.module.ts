import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { FieldEncryption } from './field-encryption';

@Global()
@Module({
  providers: [
    {
      provide: FieldEncryption,
      inject: [ENV],
      useFactory: (env: Env) =>
        new FieldEncryption(env.DATA_ENCRYPTION_KEY_ID, env.DATA_ENCRYPTION_KEY, env.DATA_ENCRYPTION_PREVIOUS_KEYS),
    },
  ],
  exports: [FieldEncryption],
})
export class CryptoModule {}
