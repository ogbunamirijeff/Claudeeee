export interface AdminJobRow {
  id: string;
  ref: string;
  status: string;
  trade: string;
  tradeSlug: string;
  area: string;
  clientName: string | null;
  description: string;
  preferredDate: string;
  timeWindow: string;
  createdAt: string;
  statusSince: string;
  artisanName: string | null;
  offerStatus: string | null;
  offerExpiresAt: string | null;
  quoteTotalCents: number | null;
  quoteReviewStatus: string | null;
}
