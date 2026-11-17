import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../../common/decorators/access.decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const AuditQuery = z.object({
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(50).optional(),
  actorId: z.string().max(50).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

@Controller('admin/audit-logs')
@Roles('ADMIN')
export class AdminAuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodPipe(AuditQuery)) q: z.output<typeof AuditQuery>) {
    const items = await this.prisma.auditLog.findMany({
      where: { entityType: q.entityType, entityId: q.entityId, actorId: q.actorId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > q.take;
    return { items: items.slice(0, q.take), nextCursor: hasMore ? items[q.take - 1]!.id : null };
  }
}
