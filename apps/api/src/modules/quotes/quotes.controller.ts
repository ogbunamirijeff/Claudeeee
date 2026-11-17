import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ReasonSchema, SubmitQuoteSchema } from '@jiko/shared';
import type { z } from 'zod';
import { CurrentUser, Roles } from '../../common/decorators/access.decorators';
import type { AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { QuotesService } from './quotes.service';

@Controller()
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post('jobs/:jobId/quotes')
  @Roles('ARTISAN')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Body(new ZodPipe(SubmitQuoteSchema)) body: z.output<typeof SubmitQuoteSchema>,
  ) {
    return this.quotes.submit(user, jobId, body);
  }

  @Post('quotes/:id/approve')
  @HttpCode(200)
  @Roles('CLIENT')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.quotes.approve(user, id);
  }

  @Post('quotes/:id/reject')
  @HttpCode(200)
  @Roles('CLIENT')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodPipe(ReasonSchema)) body: z.output<typeof ReasonSchema>,
  ) {
    return this.quotes.reject(user, id, body.reason);
  }
}
