import { z } from 'zod';
import { normalizePhone } from '../phone';

export const usPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid US mobile number',
      });
      return z.NEVER;
    }
    return n;
  });

export const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const RequestOtpSchema = z.object({ phone: usPhone });
export type RequestOtpInput = z.input<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  phone: usPhone,
  code: otpCode,
  /** Required at sign-up and whenever the Terms change (Terms, Privacy Policy and TCPA text consent). */
  acceptTerms: z.boolean().optional(),
  deviceInfo: z.string().max(200).optional(),
});
export type VerifyOtpInput = z.input<typeof VerifyOtpSchema>;

export const RefreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export type RefreshInput = z.input<typeof RefreshSchema>;

export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120).nullable(),
    defaultAreaId: z.string().min(1).nullable(),
  })
  .partial();
export type UpdateMeInput = z.input<typeof UpdateMeSchema>;

export const SetRolesSchema = z.object({
  roles: z.array(z.enum(['CLIENT', 'ARTISAN', 'ADMIN'])).min(1),
  reason: z.string().trim().min(3).max(300),
});
export type SetRolesInput = z.input<typeof SetRolesSchema>;

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface MeResponse {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  roles: ('CLIENT' | 'ARTISAN' | 'ADMIN')[];
  defaultAreaId: string | null;
  createdAt: string;
}

export interface VerifyOtpResponse extends AuthTokens {
  user: MeResponse;
  isNewUser: boolean;
}

export interface RequestOtpResponse {
  expiresAt: string;
  resendAfterSeconds: number;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}
