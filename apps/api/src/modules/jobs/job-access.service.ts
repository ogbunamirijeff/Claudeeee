import { Injectable } from '@nestjs/common';
import type { AssignmentStatus, JobStatus } from '@prisma/client';
import type { AuthUser } from '../../common/http/request-context';
import { PrismaService, type Tx } from '../../prisma/prisma.service';

export type JobViewer =
  | { role: 'client'; jobStatus: JobStatus }
  | {
      role: 'artisan';
      jobStatus: JobStatus;
      assignmentId: string;
      assignmentStatus: AssignmentStatus;
      artisanId: string;
    }
  | { role: 'admin'; jobStatus: JobStatus };

/**
 * Who is looking at a job. Order matters: an admin who is also the client sees the client view.
 * Artisans only count while their offer is open or accepted; past artisans lose access.
 */
@Injectable()
export class JobAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: AuthUser, jobId: string, tx: Tx = this.prisma): Promise<JobViewer | null> {
    const job = await tx.jobRequest.findUnique({
      where: { id: jobId },
      select: { clientId: true, status: true },
    });
    if (!job) return null;
    if (job.clientId === user.id) return { role: 'client', jobStatus: job.status };
    if (user.roles.includes('ARTISAN')) {
      const a = await tx.assignment.findFirst({
        where: { jobId, status: { in: ['OFFERED', 'ACCEPTED'] }, artisan: { userId: user.id } },
        select: { id: true, status: true, artisanId: true },
      });
      if (a)
        return {
          role: 'artisan',
          jobStatus: job.status,
          assignmentId: a.id,
          assignmentStatus: a.status,
          artisanId: a.artisanId,
        };
    }
    if (user.roles.includes('ADMIN')) return { role: 'admin', jobStatus: job.status };
    return null;
  }
}
