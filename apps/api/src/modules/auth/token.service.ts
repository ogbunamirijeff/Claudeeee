import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthTokens } from '@jiko/shared';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app-exception';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Short-lived JWT access tokens + opaque rotating refresh tokens (stored hashed).
 * Presenting an already-rotated refresh token means it was likely stolen, so the whole
 * token family is revoked and the user must sign in again.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(
    userId: string,
    deviceInfo?: string,
    familyId: string = randomUUID(),
  ): Promise<AuthTokens & { refreshTokenId: string }> {
    const now = Date.now();
    const accessExp = new Date(now + this.env.JWT_ACCESS_TTL_SECONDS * 1000);
    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: 'access' },
      { expiresIn: this.env.JWT_ACCESS_TTL_SECONDS },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExp = new Date(now + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        deviceInfo,
        expiresAt: refreshExp,
      },
    });

    return {
      accessToken,
      accessTokenExpiresAt: accessExp.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExp.toISOString(),
      refreshTokenId: row.id,
    };
  }

  async rotate(refreshToken: string, ctx: RequestContext): Promise<AuthTokens> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    const invalid = () =>
      new AppException(
        HttpStatus.UNAUTHORIZED,
        'REFRESH_INVALID',
        'Session expired, sign in again',
      );
    if (!row) throw invalid();

    if (row.revokedAt) {
      if (row.replacedById) {
        await this.revokeFamily(row.familyId);
        await this.audit.record({
          actor: null,
          action: 'auth.refresh_token_reuse',
          entityType: 'User',
          entityId: row.userId,
          after: { familyId: row.familyId },
          ctx,
        });
      }
      throw invalid();
    }
    if (row.expiresAt <= new Date() || row.user.status !== 'ACTIVE') throw invalid();

    // Claim the token atomically; a concurrent rotation of the same token loses.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw invalid();

    const next = await this.issue(row.userId, row.deviceInfo ?? undefined, row.familyId);
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { replacedById: next.refreshTokenId },
    });
    const { refreshTokenId: _, ...tokens } = next;
    return tokens;
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
