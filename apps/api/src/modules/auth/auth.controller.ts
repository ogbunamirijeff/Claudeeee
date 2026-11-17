import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  RefreshSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  type RequestOtpResponse,
} from '@jiko/shared';
import type { z } from 'zod';
import { Public } from '../../common/decorators/access.decorators';
import { contextFrom } from '../../common/http/request-context';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(
    @Body(new ZodPipe(RequestOtpSchema)) body: z.output<typeof RequestOtpSchema>,
    @Req() req: Request,
  ): Promise<RequestOtpResponse> {
    const r = await this.auth.requestOtp(body.phone, contextFrom(req));
    return { expiresAt: r.expiresAt.toISOString(), resendAfterSeconds: r.resendAfterSeconds };
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(
    @Body(new ZodPipe(VerifyOtpSchema)) body: z.output<typeof VerifyOtpSchema>,
    @Req() req: Request,
  ) {
    return this.auth.verifyOtp(body, contextFrom(req));
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodPipe(RefreshSchema)) body: z.output<typeof RefreshSchema>,
    @Req() req: Request,
  ) {
    return this.auth.refresh(body.refreshToken, contextFrom(req));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(RefreshSchema)) body: z.output<typeof RefreshSchema>) {
    await this.auth.logout(body.refreshToken);
  }
}
