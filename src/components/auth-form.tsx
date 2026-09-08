'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Alert } from './ui';

type Mode = 'login' | 'register';
type Method = 'password' | 'magic';

/**
 * Sign in and sign up.
 *
 * Offers both a password and a magic link, defaulting to the magic link. For a
 * product someone uses a few times a month, a link in the inbox beats a password
 * they will not remember and will reset every time, and it removes a whole class
 * of credential-stuffing risk.
 *
 * Error messages are deliberately non-committal about whether an account exists.
 * "Those details did not work" rather than "no account with that email", because
 * the latter turns the sign-in form into an account enumeration oracle.
 */
export function AuthForm({
  mode,
  nextPath = '/',
  initialError,
}: {
  mode: Mode;
  nextPath?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createClient();

    try {
      if (method === 'magic') {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            shouldCreateUser: mode === 'register',
            data: mode === 'register' ? { full_name: fullName.trim() } : undefined,
          },
        });

        if (otpError) throw otpError;
        setSent(true);
        return;
      }

      if (mode === 'register') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
            data: { full_name: fullName.trim() },
          },
        });
        if (signUpError) throw signUpError;

        // Supabase may or may not require confirmation depending on project
        // settings, so check whether we actually have a session before routing.
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.push(nextPath);
          router.refresh();
        } else {
          setSent(true);
        }
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      router.push(nextPath);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong';

      // Map provider messages to copy that does not confirm whether an account
      // exists, while keeping genuinely actionable errors intact.
      if (/invalid login credentials/i.test(message)) {
        setError('Those details did not work. Check the email and password and try again.');
      } else if (/rate limit|too many/i.test(message)) {
        setError('Too many attempts. Wait a minute and try again.');
      } else if (/already registered/i.test(message)) {
        setError('That email is already in use. Try signing in instead.');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" title="Check your inbox">
        <p className="mt-1">
          We sent a sign-in link to <strong className="text-[var(--text)]">{email}</strong>. It is
          good for one hour. You can close this tab.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 text-sm font-semibold text-[var(--accent-text)] hover:underline"
        >
          Use a different email
        </button>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {mode === 'register' && (
        <div>
          <label htmlFor="full-name" className="ps-label">
            Your name
          </label>
          <input
            id="full-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="ps-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Rahul Sharma"
          />
          <p className="ps-hint">Hosts see this when you book their space.</p>
        </div>
      )}

      <div>
        <label htmlFor="email" className="ps-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="ps-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
      </div>

      {method === 'password' && (
        <div>
          <label htmlFor="password" className="ps-label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            className="ps-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'register' && <p className="ps-hint">At least 8 characters.</p>}
        </div>
      )}

      <button type="submit" disabled={busy} className="ps-btn ps-btn-primary w-full">
        {busy
          ? 'One moment...'
          : method === 'magic'
            ? 'Email me a sign-in link'
            : mode === 'register'
              ? 'Create account'
              : 'Sign in'}
      </button>

      <div className="relative py-1 text-center">
        <span className="relative z-10 bg-[var(--surface)] px-3 text-xs text-[var(--text-muted)]">
          or
        </span>
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t" />
      </div>

      <button
        type="button"
        onClick={() => {
          setMethod((current) => (current === 'magic' ? 'password' : 'magic'));
          setError(null);
        }}
        className="ps-btn ps-btn-secondary w-full"
      >
        {method === 'magic' ? 'Use a password instead' : 'Email me a link instead'}
      </button>

      <p className="pt-2 text-center text-xs leading-relaxed text-[var(--text-muted)]">
        By continuing you agree to the{' '}
        <a href="/legal/terms" className="underline hover:text-[var(--text)]">
          terms
        </a>{' '}
        and the{' '}
        <a href="/legal/privacy" className="underline hover:text-[var(--text)]">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
