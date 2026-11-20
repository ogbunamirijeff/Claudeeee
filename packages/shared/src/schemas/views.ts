import type { JobAction } from '../state-machines/job';

export type JobViewerRole = 'client' | 'artisan' | 'admin';

export interface FileView {
  id: string;
  kind: string;
  url: string;
}

export interface QuoteItemView {
  kind: 'LABOUR' | 'MATERIAL';
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface QuoteSplitView {
  commissionCents: number;
  commissionFromMaterialsCents: number;
  artisanPayoutCents: number;
  materialsAdvanceCents: number;
  completionPayoutCents: number;
  materialsAdvanceCapCents: number;
}

export interface QuoteView {
  id: string;
  version: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  reviewStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  labourCents: number;
  materialsCents: number;
  totalCents: number;
  items: QuoteItemView[];
  notes: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  /** Only for the artisan and admins. */
  split?: QuoteSplitView;
}

export interface PartyView {
  name: string | null;
  /** Masked (+1 (713) •••-••23) until the job is paid. */
  phone: string;
}

export interface ArtisanSummaryView extends PartyView {
  artisanId: string;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  sealed: boolean;
}

export interface JobView {
  id: string;
  ref: string;
  status: string;
  viewer: JobViewerRole;
  trade: { id: string; slug: string; name: string };
  area: { id: string; slug: string; name: string };
  description: string;
  /** null for an artisan who has not accepted yet. */
  addressLine: string | null;
  postalCode: string;
  /** null for an artisan who has not accepted yet. */
  accessNotes: string | null;
  preferredDate: string;
  timeWindow: 'MORNING' | 'AFTERNOON' | 'EVENING';
  createdAt: string;
  photos: FileView[];
  client: PartyView;
  artisan: ArtisanSummaryView | null;
  offer: { assignmentId: string; status: string; expiresAt: string | null } | null;
  quote: QuoteView | null;
  actions: JobAction[];
  /** Live payment for the job (client and admin only). */
  payment: { id: string; status: string; amountCents: number; paidAt: string | null } | null;
  /** True when the client can pay now (quote approved and, if required, price-checked by Jiko). */
  canPay: boolean;
  startedAt: string | null;
  workSubmittedAt: string | null;
  autoReleaseAt: string | null;
  completedAt: string | null;
  guaranteeExpiresAt: string | null;
  timeline: { to: string; at: string; note: string | null }[];
}

export interface JobCardView {
  id: string;
  ref: string;
  status: string;
  trade: string;
  area: string;
  description: string;
  preferredDate: string;
  timeWindow: string;
  createdAt: string;
  artisanName: string | null;
  offerExpiresAt?: string | null;
  assignmentId?: string;
}

export interface CandidateView {
  artisanId: string;
  name: string;
  areaMatch: boolean;
  areas: string[];
  distanceMiles: number | null;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  completionRate: number;
  avgResponseSeconds: number | null;
  activeJobs: number;
}

export interface MessageView {
  id: string;
  from: 'me' | 'client' | 'artisan' | 'jiko';
  senderName: string | null;
  body: string;
  createdAt: string;
  /** Admin only. */
  contactInfoFlag?: boolean;
  originalBody?: string | null;
}

export const TIME_WINDOW_LABEL = {
  MORNING: 'Morning · 8–12',
  AFTERNOON: 'Afternoon · 12–4',
  EVENING: 'Evening · 4–7',
} as const;
