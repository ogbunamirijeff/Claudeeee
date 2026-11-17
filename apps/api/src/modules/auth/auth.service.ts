import { HttpStatus, Injectable } from '@nestjs/common';
import { CONSENT_VERSION, type VerifyOtpResponse } from '@jiko/shared';
import { AppException } from '../../common/http/app-exception';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toMe } from '../users/user.mapper';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  requestOtp(phone: string, ctx: RequestContext) {
    return this.otp.request(phone, ctx.ip);
  }

  async verifyOtp(
    input: { phone: string; code: string; acceptTerms?: boolean; deviceInfo?: string },
    ctx: RequestContext,
  ): Promise<VerifyOtpResponse> {
    const existing = await this.prisma.user.findUnique({ where: { phone: input.phone } });

    // Consent is checked before the code so a missing tick doesn't burn an attempt.
    const needsConsent = !existing || existing.consentVersion !== CONSENT_VERSION;
    if (needsConsent && input.acceptTerms !== true) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'CONSENT_REQUIRED',
        'Please accept the Terms and Privacy Policy to continue.',
        {
          consentVersion: CONSENT_VERSION,
        },
      );
    }
    if (existing?.status === 'SUSPENDED') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account is suspended. Contact Jiko support.',
      );
    }

    await this.otp.verify(input.phone, input.code);

    const now = new Date();
    const consent = needsConsent ? { consentVersion: CONSENT_VERSION, consentedAt: now } : {};
    const user = await this.prisma.user.upsert({
      where: { phone: input.phone },
      create: { phone: input.phone, roles: ['CLIENT'], lastLoginAt: now, ...consent },
      update: { lastLoginAt: now, ...consent },
    });

    if (needsConsent) {
      await this.audit.record({
        actor: { id: user.id, phone: user.phone, roles: user.roles },
        action: existing ? 'user.consent.renewed' : 'user.signup',
        entityType: 'User',
        entityId: user.id,
        after: { consentVersion: CONSENT_VERSION },
        ctx,
      });
    }

    const { refreshTokenId: _, ...tokens } = await this.tokens.issue(user.id, input.deviceInfo);
    return { ...tokens, user: toMe(user), isNewUser: !existing };
  }

  refresh(refreshToken: string, ctx: RequestContext) {
    return this.tokens.rotate(refreshToken, ctx);
  }

  logout(refreshToken: string) {
    return this.tokens.revoke(refreshToken);
  }
}
