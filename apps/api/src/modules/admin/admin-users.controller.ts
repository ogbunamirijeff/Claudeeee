import { Body, Controller, Get, HttpStatus, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { SetRolesSchema } from '@jiko/shared';
import { CurrentUser, Roles } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/http/app-exception';
import { contextFrom, type AuthUser } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';

const ListUsersQuery = z.object({
  role: z.enum(['CLIENT', 'ARTISAN', 'ADMIN']).optional(),
  q: z.string().trim().max(80).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const SetStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(300),
});

const userSelect = {
  id: true,
  phone: true,
  name: true,
  email: true,
  roles: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Controller('admin/users')
@Roles('ADMIN')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  async list(@Query(new ZodPipe(ListUsersQuery)) q: z.output<typeof ListUsersQuery>) {
    const items = await this.prisma.user.findMany({
      where: {
        status: { not: 'DELETED' },
        ...(q.role ? { roles: { has: q.role } } : {}),
        ...(q.q
          ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] }
          : {}),
      },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > q.take;
    return { items: items.slice(0, q.take), nextCursor: hasMore ? items[q.take - 1]!.id : null };
  }

  @Patch(':id/roles')
  async setRoles(
    @Param('id') id: string,
    @Body(new ZodPipe(SetRolesSchema)) body: z.output<typeof SetRolesSchema>,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    const roles = [...new Set(body.roles)];
    if (id === actor.id && !roles.includes('ADMIN')) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_REMOVE_OWN_ADMIN',
        'You cannot remove your own admin role',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!before || before.status === 'DELETED')
        throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
      const after = await tx.user.update({ where: { id }, data: { roles }, select: userSelect });
      await this.audit.record(
        {
          actor,
          action: 'user.roles.update',
          entityType: 'User',
          entityId: id,
          before: { roles: before.roles },
          after: { roles: after.roles, reason: body.reason },
          ctx: contextFrom(req),
        },
        tx,
      );
      return after;
    });
  }

  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodPipe(SetStatusSchema)) body: z.output<typeof SetStatusSchema>,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    if (id === actor.id) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CANNOT_CHANGE_OWN_STATUS',
        'You cannot change your own status',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: userSelect });
      if (!before || before.status === 'DELETED')
        throw new AppException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
      const after = await tx.user.update({
        where: { id },
        data: { status: body.status },
        select: userSelect,
      });
      await this.audit.record(
        {
          actor,
          action: 'user.status.update',
          entityType: 'User',
          entityId: id,
          before: { status: before.status },
          after: { status: after.status, reason: body.reason },
          ctx: contextFrom(req),
        },
        tx,
      );
      return after;
    });
    if (body.status === 'SUSPENDED') await this.tokens.revokeAllForUser(id);
    return result;
  }
}
