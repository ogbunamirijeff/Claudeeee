import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true,
  });
  configureApp(app);
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`Jiko API listening on :${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');
}

void main();
