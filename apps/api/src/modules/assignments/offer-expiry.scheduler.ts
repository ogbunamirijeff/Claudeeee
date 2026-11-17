import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AssignmentsService } from './assignments.service';

const QUEUE = 'offer-expiry';

/**
 * One repeatable BullMQ job sweeps expired offers (every OFFER_SWEEP_INTERVAL_MS, default 1 min). BullMQ de-duplicates the
 * repeatable job, so running several API instances is safe.
 */
@Injectable()
export class OfferExpiryScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OfferExpiryScheduler.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly assignments: AssignmentsService,
  ) {}

  async onModuleInit() {
    if (!this.env.JOBS_WORKER_ENABLED) return;
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    this.queue = new Queue(QUEUE, { connection });
    await this.queue.upsertJobScheduler(
      'sweep',
      { every: this.env.OFFER_SWEEP_INTERVAL_MS },
      { name: 'sweep' },
    );
    this.worker = new Worker(
      QUEUE,
      async () => {
        const n = await this.assignments.expireDue(new Date());
        if (n) this.logger.log(`Expired ${n} offer(s)`);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (_, err) => this.logger.error(`Offer sweep failed: ${err.message}`));
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
