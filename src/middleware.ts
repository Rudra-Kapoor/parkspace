import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Session refresh plus route gating.
 *
 * The gating here is a redirect for the benefit of the user, not a security
 * control. A signed-out person hitting /host should land on the sign-in page
 * rather than an empty dashboard. The actual protection is Row Level Security:
 * even if this middleware were removed entirely, no data would leak.
 */

const DRIVER_PREFIXES = ['/bookings', '/vehicles', '/profile', '/wallet', '/checkout', '/notifications'];
const HOST_PREFIXES = ['/host'];
const ADMIN_PREFIXES = ['/admin'];

export async function middleware(request: NextRequest) {
  // Without configuration there is no auth server to talk to, so pass through
  // and let the landing page render its setup guide.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;

  const needsAuth = [...DRIVER_PREFIXES, ...HOST_PREFIXES, ...ADMIN_PREFIXES].some((prefix) =>
    path.startsWith(prefix),
  );

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    // Preserve where they were going so the round trip is invisible.
    url.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation, which never need
    // a session and would only add latency.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)',
  ],
};
