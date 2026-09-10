'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Suspend and reinstate, inline in the user table.
 *
 * A suspension prompt that appears in a modal over the row loses the context of
 * who is being suspended, so the reason box opens in place instead.
 */
export function SuspendActions({
  userId,
  name,
  isSuspended,
}: {
  userId: string;
  name: string;
  isSuspended: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: 'suspend' | 'unsuspend') {
    setError(null);

    if (action === 'suspend' && reason.trim().length < 5) {
      setError('A reason is required.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: action === 'suspend' ? reason.trim() : undefined,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setError(body.message ?? 'That did not work.');
        return;
      }
      setOpen(false);
      setReason('');
      router.refresh();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (isSuspended) {
    return (
      <div>
        <button
          type="button"
          className="ps-btn ps-btn-secondary text-sm"
          onClick={() => void send('unsuspend')}
          disabled={busy}
        >
          {busy ? 'Working...' : 'Reinstate'}
        </button>
        {error && <p className="ps-error">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="ps-btn ps-btn-ghost text-sm"
        onClick={() => setOpen(true)}
      >
        Suspend
      </button>
    );
  }

  return (
    <div className="min-w-56">
      <label className="ps-label" htmlFor={`suspend-${userId}`}>
        Reason for suspending {name}
      </label>
      <textarea
        id={`suspend-${userId}`}
        className="ps-input min-h-20"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
      />
      {error && <p className="ps-error">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="ps-btn ps-btn-danger text-sm"
          onClick={() => void send('suspend')}
          disabled={busy}
        >
          {busy ? 'Working...' : 'Confirm'}
        </button>
        <button
          type="button"
          className="ps-btn ps-btn-ghost text-sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
