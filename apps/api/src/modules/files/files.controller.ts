import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { CreateUploadSchema } from '@jiko/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import { Authenticated, CurrentUser } from '../../common/decorators/access.decorators';
import { contextFrom, type AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { FilesService } from './files.service';

@Controller('files')
@Authenticated()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('uploads')
  createUpload(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateUploadSchema)) body: z.output<typeof CreateUploadSchema>,
  ) {
    return this.files.createUpload(user, body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.files.complete(user, id);
  }

  @Get(':id/url')
  url(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.files.viewUrl(user, id, contextFrom(req));
  }
}
