import type { User } from '@prisma/client';
import type { MeResponse } from '@jiko/shared';

export function toMe(u: User): MeResponse {
  return {
    id: u.id,
    phone: u.phone,
    name: u.name,
    email: u.email,
    roles: u.roles,
    defaultAreaId: u.defaultAreaId,
    createdAt: u.createdAt.toISOString(),
  };
}
