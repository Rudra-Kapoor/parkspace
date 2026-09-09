import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Everything behind these prefixes is either personal or an action
        // endpoint. None of it should be crawled, and /search in particular
        // would generate an unbounded crawl space from its query parameters.
        disallow: [
          '/api/',
          '/admin/',
          '/host/',
          '/bookings/',
          '/checkout/',
          '/wallet',
          '/vehicles',
          '/profile',
          '/auth/',
          '/search',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
