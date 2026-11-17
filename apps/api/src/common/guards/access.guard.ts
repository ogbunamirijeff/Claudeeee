import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_KEY, AccessRule } from '../decorators/access.decorators';
import { AppException } from '../http/app-exception';
import type { AuthedRequest } from '../http/request-context';

interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

/**
 * Global guard: authentication + role-based access control on every route.
 * Roles and status are read from the database on each request (not trusted from the token), so
 * suspensions and role changes take effect immediately.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) {
      throw new AppException(HttpStatus.FORBIDDEN, 'ROUTE_ACCESS_UNDECLARED', 'Access denied');
    }
    if (rule.kind === 'public') return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Sign in to continue');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token); // HS256 + issuer pinned in AuthModule
    } catch {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'TOKEN_INVALID', 'Session expired, sign in again');
    }
    if (payload.typ !== 'access') {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'TOKEN_INVALID', 'Session expired, sign in again');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, phone: true, roles: true, status: true },
    });
    if (!user || user.status === 'DELETED') {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'TOKEN_INVALID', 'Session expired, sign in again');
    }
    if (user.status === 'SUSPENDED') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    }
    req.user = { id: user.id, phone: user.phone, roles: user.roles };

    if (rule.kind === 'roles' && !rule.roles.some((r) => user.roles.includes(r))) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have access to this');
    }
    return true;
  }
}
