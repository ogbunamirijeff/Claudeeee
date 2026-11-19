import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/http/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from '../sms/sms.provider';

const HOUR_MS = 3_600_000;

/**
 * Our own OTP (not Twilio Verify) so codes, expiry, attempts and rate limits stay in our
 * control. Codes are never stored: only HMAC-SHA256(pepper, phone:code).
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  hash(phone: string, code: string): string {
    return createHmac('sha256', this.env.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');
  }

  async request(
    phone: string,
    ip: string | null,
  ): Promise<{ expiresAt: Date; resendAfterSeconds: number }> {
    const now = Date.now();
    const since = new Date(now - HOUR_MS);

    const [last, perPhone, perIp] = await Promise.all([
      this.prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }),
      this.prisma.otpChallenge.count({ where: { phone, createdAt: { gte: since } } }),
      ip
        ? this.prisma.otpChallenge.count({ where: { ipAddress: ip, createdAt: { gte: since } } })
        : 0,
    ]);

    const cooldownMs = this.env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
    if (last && now - last.createdAt.getTime() < cooldownMs) {
      const retryAfter = Math.ceil((cooldownMs - (now - last.createdAt.getTime())) / 1000);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_COOLDOWN',
        `Wait ${retryAfter}s before requesting another code`,
        { retryAfter },
      );
    }
    if (
      perPhone >= this.env.OTP_MAX_PER_PHONE_PER_HOUR ||
      perIp >= this.env.OTP_MAX_PER_IP_PER_HOUR
    ) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_RATE_LIMITED',
        'Too many codes requested. Try again later.',
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now + this.env.OTP_TTL_SECONDS * 1000);

    // A new code supersedes any earlier unused ones.
    await this.prisma.$transaction([
      this.prisma.otpChallenge.updateMany({
        where: { phone, consumedAt: null },
        data: { consumedAt: new Date(now) },
      }),
      this.prisma.otpChallenge.create({
        data: { phone, codeHash: this.hash(phone, code), expiresAt, ipAddress: ip },
      }),
    ]);

    const minutes = Math.round(this.env.OTP_TTL_SECONDS / 60);
    try {
      await this.sms.send({
        to: phone,
        body: `Your Jiko code is ${code}. It expires in ${minutes} minutes. Never share this code with anyone, including Jiko staff.`,
        transactional: true,
      });
    } catch (err) {
      this.logger.error(`OTP delivery failed: ${(err as Error).message}`);
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'OTP_DELIVERY_FAILED',
        'We could not send your code. Please try again.',
      );
    }

    return { expiresAt, resendAfterSeconds: this.env.OTP_RESEND_COOLDOWN_SECONDS };
  }

  /** Throws unless `code` matches the latest live challenge for `phone`. Consumes it on success. */
  async verify(phone: string, code: string): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'OTP_EXPIRED',
        'This code has expired. Request a new one.',
      );
    }

    // Count the attempt atomically before comparing, so parallel guesses can't exceed the limit.
    const bumped = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: this.env.OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count === 0) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_LOCKED',
        'Too many wrong attempts. Request a new code.',
      );
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const remaining = this.env.OTP_MAX_ATTEMPTS - (challenge.attempts + 1);
      throw new AppException(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'That code is not correct.', {
        attemptsRemaining: Math.max(0, remaining),
      });
    }

    const consumed = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'OTP_EXPIRED',
        'This code has already been used.',
      );
    }
  }
}
