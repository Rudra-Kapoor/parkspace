'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';

/**
 * Approve and reject controls.
 *
 * Rejection opens a required reason box before the button becomes live. The
 * alternative, a confirm dialog with an optional note, produces rejections with
 * no explanation, and a host who is told "no" with no reason cannot act on it.
 */
export function ModerationActions({ spaceId, title }: { spaceId: string; title: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'approve' | 'reject' | null>(null);

  async function send(action: 'approve' | 'reject') {
    setError(null);

    if (action === 'reject' && reason.trim().length < 10) {
      setError('Write at least a sentence saying what the host should change.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/spaces/${spaceId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'reject' ? reason.trim() : undefined }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setError(body.message ?? 'That decision was not recorded.');
        return;
      }
      setDone(action);
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert tone={done === 'approve' ? 'success' : 'info'} title={done === 'approve' ? 'Approved' : 'Rejected'}>
        <p className="mt-1">
          {done === 'approve'
            ? `${title} is live and the host has been notified.`
            : `${title} was rejected and the host has been sent your reason.`}
        </p>
      </Alert>
    );
  }

  return (
    <div>
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ps-btn ps-btn-primary text-sm"
            onClick={() => void send('approve')}
            disabled={busy}
          >
            {busy ? 'Working...' : 'Approve and publish'}
          </button>
          <button
            type="button"
            className="ps-btn ps-btn-danger text-sm"
            onClick={() => setMode('rejecting')}
            disabled={busy}
          >
            Reject
          </button>
        </div>
      ) : (
        <div>
          <label className="ps-label" htmlFor={`reason-${spaceId}`}>
            Why is this being rejected
          </label>
          <textarea
            id={`reason-${spaceId}`}
            className="ps-input min-h-24"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            placeholder="For example: the height limit is missing and this is a basement, so a driver with an SUV cannot tell whether they will fit."
          />
          <p className="ps-hint">
            The host is sent this word for word. Say what to change, not only what is wrong.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="ps-btn ps-btn-danger text-sm"
              onClick={() => void send('reject')}
              disabled={busy}
            >
              {busy ? 'Working...' : 'Send rejection'}
            </button>
            <button
              type="button"
              className="ps-btn ps-btn-ghost text-sm"
              onClick={() => {
                setMode('idle');
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert tone="danger" title="That did not work">
            <p className="mt-1">{error}</p>
          </Alert>
        </div>
      )}
    </div>
  );
}
