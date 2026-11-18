import type { Metadata } from 'next';
import { apiGet } from '@/lib/api';
import { BookingWizard } from './BookingWizard';

export const metadata: Metadata = { title: 'Book a job' };

export default async function BookPage() {
  const [trades, areas] = await Promise.all([
    apiGet<{ id: string; slug: string; name: string }[]>('/v1/catalog/trades'),
    apiGet<{ id: string; slug: string; name: string }[]>('/v1/catalog/areas'),
  ]);
  return <BookingWizard trades={trades} areas={areas} />;
}
