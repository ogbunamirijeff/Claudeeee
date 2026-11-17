import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { checkJobTransition, type JobAction, type JobActor, type JobContext } from '@jiko/shared';
import { AppException } from '../../common/http/app-exception';
import type { Tx } from '../../prisma/prisma.service';

export interface TransitionArgs {
  jobId: string;
  action: JobAction;
  actor: JobActor;
  actorId: string | null;
  ctx?: JobContext;
  note?: string;
  data?: Prisma.JobRequestUpdateManyMutationInput;
}

/**
 * The only way job status changes. Validates against the shared state machine, applies the
 * update only if the status is still what we read (optimistic lock), and records history.
 */
@Injectable()
export class JobTransitionsService {
  async apply(tx: Tx, a: TransitionArgs) {
    const job = await tx.jobRequest.findUnique({
      where: { id: a.jobId },
      select: { status: true },
    });
    if (!job) throw new AppException(HttpStatus.NOT_FOUND, 'JOB_NOT_FOUND', 'Job not found');

    const r = checkJobTransition(a.action, job.status, a.actor, a.ctx);
    if (!r.ok) {
      const status =
        r.code === 'NOT_ALLOWED'
          ? HttpStatus.FORBIDDEN
          : r.code === 'GUARD_FAILED'
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : HttpStatus.CONFLICT;
      throw new AppException(
        status,
        r.code === 'INVALID_STATE' ? 'INVALID_JOB_STATE' : r.code,
        r.reason,
      );
    }

    const updated = await tx.jobRequest.updateMany({
      where: { id: a.jobId, status: r.from },
      data: { status: r.to, ...a.data },
    });
    if (updated.count !== 1) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONCURRENT_UPDATE',
        'This job just changed. Refresh and try again.',
      );
    }
    await tx.jobStatusEvent.create({
      data: {
        jobId: a.jobId,
        from: r.from,
        to: r.to,
        actorId: a.actorId,
        note: a.note ?? a.action,
      },
    });
    return { from: r.from, to: r.to };
  }
}
