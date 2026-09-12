import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Auth callback.
 *
 * Exchanges the one-time code from a magic link or a confirmation email for a
 * session cookie, then sends the user where they were originally going.
 *
 * The `next` parameter is validated as a same-origin relative path. Accepting an
 * arbitrary URL here would turn the sign-in flow into an open redirect, which is
 * a phishing primitive: an attacker sends a genuine ParkSpace link that lands
 * the user on a page they control, already trusting the domain.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/';

  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent('That link is missing its code. Request a new one.')}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent('That link has expired or has already been used. Request a new one.')}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
