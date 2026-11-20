import { Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { JobsModule } from '../jobs/jobs.module';
import { DevPaymentsController } from './dev-payments.controller';
import { FakeGateway } from './fake.gateway';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateway';
import { LedgerService } from './ledger.service';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeGateway } from './stripe.gateway';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [JobsModule],
  controllers: [PaymentsController, DevPaymentsController],
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [ENV],
      useFactory: (env: Env): PaymentGateway =>
        env.PAYMENTS_PROVIDER === 'stripe'
          ? new StripeGateway(env.STRIPE_SECRET_KEY!)
          : new FakeGateway(env.WEB_URL),
    },
    LedgerService,
    PaymentsService,
    WebhooksService,
    MaintenanceScheduler,
  ],
  exports: [PaymentsService, LedgerService, MaintenanceScheduler, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
