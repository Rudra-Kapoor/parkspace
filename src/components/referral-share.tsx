'use client';

import { useState } from 'react';
import { Card } from './ui';

/**
 * Referral sharing.
 *
 * Uses the Web Share API where it exists, because on a phone that opens the
 * share sheet the person already knows, and falls back to copy-to-clipboard
 * everywhere else. The reward only releases after the friend completes a
 * booking, and the copy says so, because a reward that silently never arrives
 * is worse than no reward offer at all.
 */
export function ReferralShare({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const link = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/register?ref=${code}`
    : `/auth/register?ref=${code}`;

  const message = `I have been using ParkSpace to book parking before I set off. Use my code ${code} and we both get Rs 100 credit after your first booking. ${link}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ParkSpace', text: message, url: link });
        return;
      } catch {
        // The user dismissed the sheet. Fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Invite a friend</h2>
      <p className="mt-1.5 text-sm text-[var(--text-muted)]">
        You both get Rs 100 in credit once they finish their first booking. The reward
        releases then, not when they sign up.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-lg border bg-[var(--surface-sunken)] px-4 py-2.5 font-mono text-lg font-bold tracking-widest">
          {code}
        </code>
        <button type="button" onClick={share} className="ps-btn ps-btn-primary">
          {copied ? 'Copied' : 'Share your code'}
        </button>
      </div>
    </Card>
  );
}
