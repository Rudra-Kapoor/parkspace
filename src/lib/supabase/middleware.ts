import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '../env';

/**
 * Refreshes the auth session on every request and forwards the rotated cookies.
 *
 * Without this, a Server Component reading an expired token would log the user
 * out mid-session even though their refresh token is still valid.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() rather than getSession(): getSession reads the cookie without
  // verifying it, so it will happily return a forged session. getUser checks
  // with the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
