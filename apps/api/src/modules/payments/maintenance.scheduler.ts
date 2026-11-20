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
import { AssignmentsService } from '../assignments/assignments.service';
import { PaymentsService } from './payments.service';

const QUEUE = 'maintenance';

/**
 * One repeatable BullMQ job (every OFFER_SWEEP_INTERVAL_MS, default 1 min) runs the time-based
 * rules: expire unanswered offers, auto-release jobs 48h after work is submitted, and retry
 * payouts. BullMQ de-duplicates the scheduler, so several API instances are safe.
 */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly assignments: AssignmentsService,
    private readonly payments: PaymentsService,
  ) {}

  /** One pass of every time-based rule. Exposed for tests and ops. */
  async sweep(now = new Date()) {
    const expired = await this.assignments.expireDue(now);
    const released = await this.payments.autoReleaseDue(now);
    const paid = await this.payments.retryPayouts();
    if (expired || released || paid)
      this.logger.log(
        `Sweep: ${expired} offer(s) expired, ${released} job(s) auto-released, ${paid} payout(s) sent`,
      );
    return { expired, released, paid };
  }

  async onModuleInit() {
    if (!this.env.JOBS_WORKER_ENABLED) return;
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    const prefix = this.env.QUEUE_PREFIX;
    this.queue = new Queue(QUEUE, { connection, prefix });
    await this.queue.upsertJobScheduler(
      'sweep',
      { every: this.env.OFFER_SWEEP_INTERVAL_MS },
      { name: 'sweep' },
    );
    this.worker = new Worker(QUEUE, async () => void (await this.sweep()), {
      connection,
      prefix,
      concurrency: 1,
    });
    this.worker.on('failed', (_, err) =>
      this.logger.error(`Maintenance sweep failed: ${err.message}`),
    );
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
