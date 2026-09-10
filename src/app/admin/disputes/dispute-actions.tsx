'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';

const OUTCOMES = [
  { value: 'resolved_driver', label: 'Resolved for the driver' },
  { value: 'resolved_host', label: 'Resolved for the host' },
  { value: 'resolved_split', label: 'Resolved, split between them' },
  { value: 'rejected', label: 'Rejected, no case to answer' },
] as const;

const WORKING_STATUSES = [
  { value: 'investigating', label: 'Mark as investigating' },
  { value: 'awaiting_user', label: 'Waiting on the user' },
] as const;

/**
 * Dispute controls.
 *
 * Assignment and resolution are separate actions on purpose. Taking a case is
 * cheap and reversible; deciding it is neither, so it sits behind a note that
 * both parties will be sent.
 */
export function DisputeActions({
  disputeId,
  assignedToMe,
  isResolved,
}: {
  disputeId: string;
  assignedToMe: boolean;
  isResolved: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<string>('resolved_driver');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setError(body.message ?? 'That change was not saved.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('We could not reach the server.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (note.trim().length < 10) {
      setError('Write a resolution note. Both parties are shown it.');
      return;
    }
    const ok = await patch({ status: outcome, resolution_note: note.trim() });
    if (ok) {
      setOpen(false);
      setNote('');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!assignedToMe ? (
          <button
            type="button"
            className="ps-btn ps-btn-secondary text-sm"
            onClick={() => void patch({ assign_to_self: true })}
            disabled={busy}
          >
            Assign to me
          </button>
        ) : (
          <button
            type="button"
            className="ps-btn ps-btn-ghost text-sm"
            onClick={() => void patch({ unassign: true })}
            disabled={busy}
          >
            Release
          </button>
        )}

        {!isResolved &&
          WORKING_STATUSES.map((status) => (
            <button
              key={status.value}
              type="button"
              className="ps-btn ps-btn-ghost text-sm"
              onClick={() => void patch({ status: status.value })}
              disabled={busy}
            >
              {status.label}
            </button>
          ))}

        {!isResolved && !open && (
          <button
            type="button"
            className="ps-btn ps-btn-primary text-sm"
            onClick={() => setOpen(true)}
            disabled={busy}
          >
            Resolve
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-[var(--border)] p-3">
          <label className="ps-label" htmlFor={`outcome-${disputeId}`}>
            Outcome
          </label>
          <select
            id={`outcome-${disputeId}`}
            className="ps-input"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            {OUTCOMES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="ps-label mt-3" htmlFor={`note-${disputeId}`}>
            Resolution note
          </label>
          <textarea
            id={`note-${disputeId}`}
            className="ps-input min-h-24"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={4000}
            placeholder="What you found, what you decided, and what happens next."
          />
          <p className="ps-hint">
            Sent to both parties word for word. Say what was decided and why, not only the outcome.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="ps-btn ps-btn-primary text-sm"
              onClick={() => void resolve()}
              disabled={busy}
            >
              {busy ? 'Saving...' : 'Record decision'}
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
      )}

      {error && (
        <Alert tone="danger" title="That did not work">
          <p className="mt-1">{error}</p>
        </Alert>
      )}
    </div>
  );
}
