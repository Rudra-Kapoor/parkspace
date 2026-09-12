import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv, serverEnv } from '../env';

/**
 * The request-scoped Supabase client.
 *
 * Runs as the signed-in user, so every query it issues is subject to Row Level
 * Security. This is the client that almost all server code should use: if a
 * query through this client returns a row, the user was entitled to it.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The service-role client. Bypasses every RLS policy.
 *
 * Legitimate uses are narrow and all of them are server-side infrastructure:
 *
 *   - verifying a payment webhook and confirming the booking it refers to
 *   - the scheduled sweepers that expire holds and complete stale bookings
 *   - admin operations that have already checked the caller is an admin
 *   - the seed script
 *
 * If you are reaching for this to make a query "just work", the query is wrong
 * or a policy is missing. Fix that instead.
 */
export function createServiceClient() {
  const pub = publicEnv();
  const srv = serverEnv();

  // Imported lazily so that @supabase/supabase-js is not pulled into any bundle
  // that only needs the request-scoped client.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

  return createSupabaseClient(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-parkspace-context': 'service-role' } },
  });
}

/** The signed-in user, or null. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The signed-in user's profile, or null. */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

/**
 * Require a signed-in user with one of the given roles.
 *
 * This is a convenience for page code and is NOT the security boundary. The
 * boundary is RLS. If this check were the only thing standing between a driver
 * and the admin panel, a missing policy would be an incident.
 */
export async function requireRole(roles: string[]) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false as const, reason: 'unauthenticated' as const, profile: null };
  if (profile.is_suspended) {
    return { ok: false as const, reason: 'suspended' as const, profile };
  }
  if (!roles.includes(profile.role)) {
    return { ok: false as const, reason: 'forbidden' as const, profile };
  }
  return { ok: true as const, reason: null, profile };
}
