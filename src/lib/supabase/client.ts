'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '../env';

/**
 * The browser client. Only ever holds the anon key, which is safe to ship
 * because every table it can reach is protected by Row Level Security.
 */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (cached) return cached;
  const env = publicEnv();
  cached = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cached;
}
