import { z } from 'zod';
import { MAX_CENTS } from '../money';

const id = z.string().min(1).max(40);
const reason = z.string().trim().min(3, 'Please give a short reason').max(300);

// Rough bounding box for the Houston metro (pilot market); coordinates outside are rejected.
const lat = z.number().min(29.3).max(30.3);
const lng = z.number().min(-96.1).max(-94.7);

/** Houston-area ZIP codes (770xx–775xx). Widen when Jiko launches in a new metro. */
export const SERVICE_ZIP_PATTERN = /^77[0-5]\d{2}$/;

export const CreateJobSchema = z.object({
  tradeId: id,
  areaId: id,
  description: z.string().trim().min(10, 'Describe the problem in a few words').max(1000),
  addressLine: z.string().trim().min(5).max(200),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Enter a 5-digit ZIP code')
    .regex(SERVICE_ZIP_PATTERN, 'Jiko serves the Houston area for now'),
  /** Gate code, parking, pets — shown to the artisan only after they accept. */
  accessNotes: z.string().trim().max(200).optional(),
  lat: lat.optional(),
  lng: lng.optional(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  timeWindow: z.enum(['MORNING', 'AFTERNOON', 'EVENING']),
  photoFileIds: z.array(id).max(5).default([]),
});
export type CreateJobInput = z.input<typeof CreateJobSchema>;

export const ReasonSchema = z.object({ reason });
export type ReasonInput = z.input<typeof ReasonSchema>;

export const AssignSchema = z.object({
  artisanId: id,
  note: z.string().trim().max(300).optional(),
});
export type AssignInput = z.input<typeof AssignSchema>;

export const QuoteItemSchema = z.object({
  kind: z.enum(['LABOUR', 'MATERIAL']),
  description: z.string().trim().min(2).max(120),
  quantity: z.number().int().min(1).max(1000),
  unitPriceCents: z.number().int().min(0).max(MAX_CENTS),
});
export const SubmitQuoteSchema = z.object({
  items: z.array(QuoteItemSchema).min(1, 'Add at least one item').max(30),
  notes: z.string().trim().max(500).optional(),
});
export type SubmitQuoteInput = z.input<typeof SubmitQuoteSchema>;

export const ReviewQuoteSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(3).max(300),
});
export type ReviewQuoteInput = z.input<typeof ReviewQuoteSchema>;

export const SendMessageSchema = z.object({ body: z.string().trim().min(1).max(1000) });
export type SendMessageInput = z.input<typeof SendMessageSchema>;

export const UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Photos are resized on the device first; 2 MB is a generous ceiling for a 1600px JPEG. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const CreateUploadSchema = z.object({
  kind: z.enum([
    'JOB_REQUEST_PHOTO',
    'JOB_PHOTO_BEFORE',
    'JOB_PHOTO_AFTER',
    'MATERIALS_RECEIPT',
    'MESSAGE_ATTACHMENT',
  ]),
  mimeType: z.enum(UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, 'Photo is too large (max 2 MB)'),
  jobId: id.optional(),
});
export type CreateUploadInput = z.input<typeof CreateUploadSchema>;

export interface UploadTicket {
  fileId: string;
  method: 'POST';
  url: string;
  /** Form fields to send before the `file` field (S3 presigned POST policy). */
  fields: Record<string, string>;
  expiresAt: string;
}
