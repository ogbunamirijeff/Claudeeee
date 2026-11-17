import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ReasonSchema, type JobCardView } from '@jiko/shared';
import type { z } from 'zod';
import { CurrentUser, Roles } from '../../common/decorators/access.decorators';
import type { AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignmentsService } from '../assignments/assignments.service';

@Controller()
@Roles('ARTISAN')
export class ArtisanController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  /** Open offers first, then accepted jobs that are still in progress. */
  @Get('artisan/jobs')
  async jobs(@CurrentUser() user: AuthUser): Promise<JobCardView[]> {
    const rows = await this.prisma.assignment.findMany({
      where: {
        artisan: { userId: user.id },
        OR: [
          { status: 'OFFERED' },
          {
            status: 'ACCEPTED',
            job: { status: { notIn: ['COMPLETED', 'REFUNDED', 'CANCELLED'] } },
          },
        ],
      },
      include: { job: { include: { trade: true, area: true } } },
      orderBy: [{ status: 'desc' }, { offeredAt: 'desc' }],
      take: 50,
    });
    return rows.map((a) => ({
      id: a.job.id,
      ref: a.job.ref,
      status: a.status === 'OFFERED' ? 'OFFERED' : a.job.status,
      trade: a.job.trade.name,
      area: a.job.area.name,
      description: a.job.description,
      preferredDate: a.job.preferredDate.toISOString().slice(0, 10),
      timeWindow: a.job.timeWindow,
      createdAt: a.job.createdAt.toISOString(),
      artisanName: null,
      offerExpiresAt: a.status === 'OFFERED' ? (a.expiresAt?.toISOString() ?? null) : null,
      assignmentId: a.id,
    }));
  }

  @Post('assignments/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.accept(user, id);
  }

  @Post('assignments/:id/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ReasonSchema)) body: z.output<typeof ReasonSchema>,
  ) {
    return this.assignments.decline(user, id, body.reason);
  }
}
