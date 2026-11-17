import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Jiko — vetted artisans in Lagos', template: '%s · Jiko' },
  description: 'Book Craft Seal–verified plumbers, electricians and AC technicians in Lagos. Clear quotes, protected payment.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1c1917' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
