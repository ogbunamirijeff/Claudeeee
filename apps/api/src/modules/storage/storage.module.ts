import { Global, Module } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { LocalStorageDriver } from './local.driver';
import { LocalStorageController } from './local-storage.controller';
import { S3StorageDriver } from './s3.driver';
import { STORAGE_DRIVER, type StorageDriver } from './storage.driver';

@Global()
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ENV],
      useFactory: (env: Env): StorageDriver =>
        env.STORAGE_DRIVER === 's3'
          ? new S3StorageDriver({
              endpoint: env.S3_ENDPOINT,
              region: env.S3_REGION,
              accessKeyId: env.S3_ACCESS_KEY_ID!,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
              forcePathStyle: env.S3_FORCE_PATH_STYLE,
            })
          : new LocalStorageDriver(
              env.LOCAL_STORAGE_DIR,
              env.PUBLIC_API_URL,
              createHmac('sha256', env.JWT_ACCESS_SECRET).update('local-storage-v1').digest('hex'),
            ),
    },
  ],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
