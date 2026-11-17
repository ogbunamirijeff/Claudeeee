import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { UpdateMeSchema, type MeResponse } from '@jiko/shared';
import type { z } from 'zod';
import { Authenticated, CurrentUser } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/http/app-exception';
import type { AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { toMe } from './user.mapper';

@Controller('me')
@Authenticated()
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return toMe(await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
  }

  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(UpdateMeSchema)) body: z.output<typeof UpdateMeSchema>,
  ): Promise<MeResponse> {
    if (body.defaultAreaId) {
      const area = await this.prisma.serviceArea.findFirst({ where: { id: body.defaultAreaId, isActive: true } });
      if (!area) throw new AppException(HttpStatus.BAD_REQUEST, 'AREA_NOT_FOUND', 'Unknown service area');
    }
    return toMe(await this.prisma.user.update({ where: { id: user.id }, data: body }));
  }
}
