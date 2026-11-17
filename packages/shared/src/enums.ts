/**
 * Mirrors the Prisma enums so web and mobile can use them without the Prisma client.
 * apps/api/test/enums-sync.spec.ts fails if these drift from schema.prisma.
 */
const e = <const T extends readonly string[]>(...values: T) =>
  Object.freeze(Object.fromEntries(values.map((v) => [v, v]))) as { readonly [K in T[number]]: K };

export const Role = e('CLIENT', 'ARTISAN', 'ADMIN');
export type Role = keyof typeof Role;

export const UserStatus = e('ACTIVE', 'SUSPENDED', 'DELETED');
export type UserStatus = keyof typeof UserStatus;

export const SealStatus = e('NOT_STARTED', 'IN_PROGRESS', 'SEALED', 'SUSPENDED', 'REVOKED');
export type SealStatus = keyof typeof SealStatus;

export const VerificationType = e(
  'GOVERNMENT_ID',
  'PHONE_ADDRESS',
  'REFERENCES',
  'SKILLS_TEST',
  'GUARANTOR',
  'BACKGROUND_CHECK',
);
export type VerificationType = keyof typeof VerificationType;

export const VerificationStatus = e('PENDING', 'PASSED', 'FAILED');
export type VerificationStatus = keyof typeof VerificationStatus;

export const TimeWindow = e('MORNING', 'AFTERNOON', 'EVENING');
export type TimeWindow = keyof typeof TimeWindow;

export const JobStatus = e(
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'QUOTED',
  'AWAITING_PAYMENT',
  'PAID',
  'IN_PROGRESS',
  'WORK_SUBMITTED',
  'COMPLETED',
  'DISPUTED',
  'REFUNDED',
  'CANCELLED',
);
export type JobStatus = keyof typeof JobStatus;

export const AssignmentStatus = e('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');
export type AssignmentStatus = keyof typeof AssignmentStatus;

export const QuoteStatus = e('SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED');
export type QuoteStatus = keyof typeof QuoteStatus;

export const QuoteReviewStatus = e('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');
export type QuoteReviewStatus = keyof typeof QuoteReviewStatus;

export const QuoteItemKind = e('LABOUR', 'MATERIAL');
export type QuoteItemKind = keyof typeof QuoteItemKind;

export const PaymentStatus = e(
  'INITIALIZED',
  'HELD',
  'PARTIALLY_RELEASED',
  'RELEASED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'FAILED',
  'ABANDONED',
);
export type PaymentStatus = keyof typeof PaymentStatus;

export const PayoutStatus = e('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REVERSED');
export type PayoutStatus = keyof typeof PayoutStatus;

export const ReleaseTrigger = e(
  'MATERIALS_ADVANCE',
  'CLIENT_CONFIRMED',
  'AUTO_RELEASE',
  'DISPUTE_RESOLUTION',
);
export type ReleaseTrigger = keyof typeof ReleaseTrigger;

export const RefundStatus = e('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');
export type RefundStatus = keyof typeof RefundStatus;

export const LedgerAccount = e(
  'PAYSTACK_INFLOW',
  'ESCROW',
  'ARTISAN_PAYABLE',
  'ARTISAN_PAID_OUT',
  'PLATFORM_COMMISSION',
  'PAYSTACK_FEES',
  'PLATFORM_LOSSES',
  'CLIENT_REFUNDED',
);
export type LedgerAccount = keyof typeof LedgerAccount;

export const DisputeKind = e('COMPLETION', 'WARRANTY');
export type DisputeKind = keyof typeof DisputeKind;

export const DisputeStatus = e('OPEN', 'UNDER_REVIEW', 'RESOLVED');
export type DisputeStatus = keyof typeof DisputeStatus;

export const DisputeResolution = e(
  'RELEASE_TO_ARTISAN',
  'FULL_REFUND',
  'PARTIAL_REFUND',
  'REDO_ORDERED',
);
export type DisputeResolution = keyof typeof DisputeResolution;

export const ReviewDirection = e('CLIENT_TO_ARTISAN', 'ARTISAN_TO_CLIENT');
export type ReviewDirection = keyof typeof ReviewDirection;

export const NotificationChannel = e('WHATSAPP', 'SMS', 'PUSH');
export type NotificationChannel = keyof typeof NotificationChannel;

export const NotificationStatus = e('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');
export type NotificationStatus = keyof typeof NotificationStatus;

export const FileKind = e(
  'AVATAR',
  'ID_DOCUMENT',
  'VERIFICATION_EVIDENCE',
  'JOB_REQUEST_PHOTO',
  'JOB_PHOTO_BEFORE',
  'JOB_PHOTO_AFTER',
  'MATERIALS_RECEIPT',
  'DISPUTE_EVIDENCE',
  'MESSAGE_ATTACHMENT',
);
export type FileKind = keyof typeof FileKind;

export const FileSensitivity = e('STANDARD', 'SENSITIVE');
export type FileSensitivity = keyof typeof FileSensitivity;

/** File kinds that go to the private bucket: admin-only, every view audited. */
export const SENSITIVE_FILE_KINDS: readonly FileKind[] = ['ID_DOCUMENT', 'VERIFICATION_EVIDENCE'];

export const ALL_ENUMS = {
  Role,
  UserStatus,
  SealStatus,
  VerificationType,
  VerificationStatus,
  TimeWindow,
  JobStatus,
  AssignmentStatus,
  QuoteStatus,
  QuoteReviewStatus,
  QuoteItemKind,
  PaymentStatus,
  PayoutStatus,
  ReleaseTrigger,
  RefundStatus,
  LedgerAccount,
  DisputeKind,
  DisputeStatus,
  DisputeResolution,
  ReviewDirection,
  NotificationChannel,
  NotificationStatus,
  FileKind,
  FileSensitivity,
} as const;
