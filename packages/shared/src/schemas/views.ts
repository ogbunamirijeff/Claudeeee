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
  unitPriceKobo: number;
  totalKobo: number;
}

export interface QuoteSplitView {
  commissionKobo: number;
  commissionFromMaterialsKobo: number;
  artisanPayoutKobo: number;
  materialsAdvanceKobo: number;
  completionPayoutKobo: number;
  materialsAdvanceCapKobo: number;
}

export interface QuoteView {
  id: string;
  version: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  reviewStatus: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  labourKobo: number;
  materialsKobo: number;
  totalKobo: number;
  items: QuoteItemView[];
  notes: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  /** Only for the artisan and admins. */
  split?: QuoteSplitView;
}

export interface PartyView {
  name: string | null;
  /** Masked (+234 80•• ••• •12) until the job is paid. */
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
  landmark: string | null;
  preferredDate: string;
  timeWindow: 'MORNING' | 'AFTERNOON' | 'EVENING';
  createdAt: string;
  photos: FileView[];
  client: PartyView;
  artisan: ArtisanSummaryView | null;
  offer: { assignmentId: string; status: string; expiresAt: string | null } | null;
  quote: QuoteView | null;
  actions: JobAction[];
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
  distanceKm: number | null;
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
