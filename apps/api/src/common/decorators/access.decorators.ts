import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthUser, AuthedRequest } from '../http/request-context';

/**
 * Every route must declare who may call it. The global AccessGuard denies any route that has
 * none of these, so forgetting a decorator fails closed.
 */
export const ACCESS_KEY = 'jiko:access';
export type AccessRule =
  { kind: 'public' } | { kind: 'authenticated' } | { kind: 'roles'; roles: Role[] };

/** No authentication. Use only for login, health and public catalogue data. */
export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessRule);
/** Any signed-in active user, whatever their role. */
export const Authenticated = () =>
  SetMetadata(ACCESS_KEY, { kind: 'authenticated' } satisfies AccessRule);
/** Signed-in user holding at least one of these roles. */
export const Roles = (...roles: Role[]) =>
  SetMetadata(ACCESS_KEY, { kind: 'roles', roles } satisfies AccessRule);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentUser used on a route without authentication');
  return req.user;
});
