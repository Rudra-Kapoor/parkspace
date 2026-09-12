/** @type {import('next').NextConfig} */

// Content Security Policy.
//
// The map stack is deliberately self-hosted-free: tiles come from the OpenStreetMap
// tile servers and geocoding is proxied through our own /api/geocode route so that we
// control the User-Agent and the cache. That means the CSP can stay tight: no Google
// Maps, no third-party key broker, no analytics beacon by default.
const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required for those.
  // MapLibre compiles its style expressions with new Function(), hence 'unsafe-eval'.
  // Razorpay's checkout sheet is injected on demand at payment time. Without
  // this entry the real gateway silently fails to load and the driver sees a
  // dead Pay button.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  // OSM raster tiles, Supabase Storage renders, and data/blob URIs for QR codes.
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.supabase.co",
  "font-src 'self' data:",
  // Supabase REST/Realtime, the OSRM routing demo server, and Nominatim (server side
  // only, but listed for completeness when running the dev proxy).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://router.project-osrm.org https://nominatim.openstreetmap.org https://api.razorpay.com https://lumberjack.razorpay.com",
  "worker-src 'self' blob:",
  // The checkout sheet renders in an iframe of its own.
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    // Geolocation is genuinely needed ("find parking near me"). Everything else off.
    value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },

  experimental: {
    // Keeps the server-action payload small and the bundle honest.
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  async redirects() {
    return [
      { source: '/host/signup', destination: '/list-your-space', permanent: true },
      { source: '/terms', destination: '/legal/terms', permanent: true },
      { source: '/privacy', destination: '/legal/privacy', permanent: true },
    ];
  },
};

export default nextConfig;
