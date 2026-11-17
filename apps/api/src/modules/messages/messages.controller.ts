import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SendMessageSchema } from '@jiko/shared';
import { z } from 'zod';
import { Authenticated, CurrentUser } from '../../common/decorators/access.decorators';
import type { AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { MessagesService } from './messages.service';

const ListQuery = z.object({ after: z.string().datetime().optional() });

@Controller('jobs/:jobId/messages')
@Authenticated()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** Poll with ?after=<last createdAt> — cheaper than websockets on flaky 3G. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Query(new ZodPipe(ListQuery)) q: z.output<typeof ListQuery>,
  ) {
    return this.messages.list(user, jobId, q.after ? new Date(q.after) : undefined);
  }

  @Post()
  send(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body(new ZodPipe(SendMessageSchema)) body: z.output<typeof SendMessageSchema>,
  ) {
    return this.messages.send(user, jobId, body.body);
  }
}
