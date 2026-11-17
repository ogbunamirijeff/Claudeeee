import type { Request } from 'express';
import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  phone: string;
  roles: Role[];
}

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export type AuthedRequest = Request & { user?: AuthUser };

export function contextFrom(req: Request): RequestContext {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
  };
}
