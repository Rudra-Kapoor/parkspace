import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ParkSpace — rent a parking space before you arrive',
    template: '%s · ParkSpace',
  },
  description:
    'ParkSpace connects drivers with unused driveways, garages and private parking. ' +
    'Reserve a guaranteed space by the hour, day or month, and turn your own empty ' +
    'parking into income.',
  keywords: [
    'parking',
    'parking near me',
    'rent parking space',
    'monthly parking',
    'Kolkata parking',
    'driveway rental',
  ],
  openGraph: {
    type: 'website',
    siteName: 'ParkSpace',
    title: 'ParkSpace — rent a parking space before you arrive',
    description:
      'Reserve a guaranteed parking space by the hour, day or month. Or list your own ' +
      'empty driveway and let it earn.',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ParkSpace',
    description: 'Rent a parking space before you arrive.',
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#12161a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body>
        {/* The first focusable element on every page. Without it, keyboard users
            tab through the entire header on every navigation, and on the search
            page they would tab through the map controls too. */}
        <a
          href="#main"
          className="sr-only-focusable ps-btn ps-btn-primary absolute left-4 top-4 z-[100]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
