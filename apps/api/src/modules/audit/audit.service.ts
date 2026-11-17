import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import type { AuthUser, RequestContext } from '../../common/http/request-context';

export interface AuditEntry {
  actor: AuthUser | null; // null = system
  action: string; // e.g. "user.roles.update"
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ctx?: RequestContext;
}

/**
 * Append-only audit trail (UPDATE/DELETE are blocked by a DB trigger). Pass the transaction
 * client so the audit row commits or rolls back together with the change it describes.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Tx = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorRole: entry.actor ? AuditService.primaryRole(entry.actor.roles) : null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        ipAddress: entry.ctx?.ip ?? null,
        userAgent: entry.ctx?.userAgent ?? null,
      },
    });
  }

  private static primaryRole(roles: Role[]): Role | null {
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (roles.includes('ARTISAN')) return 'ARTISAN';
    return roles[0] ?? null;
  }
}
