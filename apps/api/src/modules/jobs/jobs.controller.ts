import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { CreateJobSchema, ReasonSchema } from '@jiko/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { Authenticated, CurrentUser, Roles } from '../../common/decorators/access.decorators';
import { contextFrom, type AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @Roles('CLIENT')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateJobSchema)) body: z.output<typeof CreateJobSchema>,
  ) {
    return this.jobs.create(user, body);
  }

  @Get()
  @Roles('CLIENT')
  list(@CurrentUser() user: AuthUser) {
    return this.jobs.listForClient(user);
  }

  /** Client, the offered/assigned artisan, or an admin — each gets a tailored view. */
  @Get(':id')
  @Authenticated()
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobs.view(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('CLIENT', 'ADMIN')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ReasonSchema)) body: z.output<typeof ReasonSchema>,
    @Req() req: Request,
  ) {
    return this.jobs.cancel(user, id, body.reason, contextFrom(req));
  }
}
