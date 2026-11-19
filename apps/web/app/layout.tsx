import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Jiko — vetted home pros in Houston', template: '%s · Jiko' },
  description:
    'Book licensed, insured, Craft Seal–verified plumbers, electricians and HVAC techs in Houston. Clear quotes, protected payment.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1c1917' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
