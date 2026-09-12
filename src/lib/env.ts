import { z } from 'zod';

/**
 * Environment access.
 *
 * Two rules are enforced here rather than by convention:
 *
 * 1. The service-role key is read through `serverEnv()` only, which throws if it
 *    is ever evaluated in a browser bundle. That key bypasses every Row Level
 *    Security policy in the database, so shipping it to a client would hand any
 *    visitor the whole dataset.
 *
 * 2. Missing configuration fails loudly at the point of use with a message that
 *    says which variable is missing and where to get it, rather than producing an
 *    undefined that surfaces later as an unrelated runtime error.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL must be the full https URL of your Supabase project'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short to be a real anon key'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_MAP_STYLE: z.string().default('osm-raster'),
  NEXT_PUBLIC_DEFAULT_CITY: z.string().default('Kolkata'),
  NEXT_PUBLIC_DEFAULT_LAT: z.coerce.number().default(22.5726),
  NEXT_PUBLIC_DEFAULT_LNG: z.coerce.number().default(88.3639),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'SUPABASE_SERVICE_ROLE_KEY is required for webhook and cron routes'),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay']).default('mock'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NOMINATIM_USER_AGENT: z
    .string()
    .default('ParkSpace/0.1 (self-hosted; contact: set NOMINATIM_USER_AGENT)'),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

let cachedPublic: PublicEnv | null = null;

/**
 * Safe in both the browser and the server. Next.js inlines NEXT_PUBLIC_ values at
 * build time, so each one must be referenced as a static property access rather
 * than through a dynamic index.
 */
export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_MAP_STYLE: process.env.NEXT_PUBLIC_MAP_STYLE,
    NEXT_PUBLIC_DEFAULT_CITY: process.env.NEXT_PUBLIC_DEFAULT_CITY,
    NEXT_PUBLIC_DEFAULT_LAT: process.env.NEXT_PUBLIC_DEFAULT_LAT,
    NEXT_PUBLIC_DEFAULT_LNG: process.env.NEXT_PUBLIC_DEFAULT_LNG,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(
      `ParkSpace is not configured.\n\n${missing}\n\n` +
        `Copy .env.example to .env.local and fill in the values from your Supabase ` +
        `project settings, under Project Settings then API.`,
    );
  }

  cachedPublic = parsed.data;
  return cachedPublic;
}

let cachedServer: ServerEnv | null = null;

/**
 * Server only. Throws if reached from a browser bundle.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() was called in the browser. The service-role key bypasses Row Level ' +
        'Security and must never reach a client bundle. Move this call into a server ' +
        'component, a route handler, or a server action.',
    );
  }

  if (cachedServer) return cachedServer;

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    NOMINATIM_USER_AGENT: process.env.NOMINATIM_USER_AGENT,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Server environment is incomplete.\n\n${missing}`);
  }

  cachedServer = parsed.data;
  return cachedServer;
}

/**
 * True when the app can talk to a database at all. Used by the landing page to
 * render a setup guide instead of a stack trace on a fresh clone.
 */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
