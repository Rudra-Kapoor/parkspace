'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The host reply box.
 *
 * Deliberately plain. A reply is read by every future driver considering the
 * space, and the useful advice is to answer the substance rather than to argue,
 * so the form says that once and then gets out of the way.
 */
export function RespondForm({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (value.trim().length < 2) {
      setError('Write a reply before posting it.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: value.trim() }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setError(body.message ?? 'We could not post that reply.');
        return;
      }
      setValue('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ps-btn ps-btn-secondary text-sm" onClick={() => setOpen(true)}>
        Reply to this review
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2">
      <label className="ps-label" htmlFor={`respond-${reviewId}`}>
        Your reply
      </label>
      <textarea
        id={`respond-${reviewId}`}
        className="ps-input min-h-24"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={1000}
        aria-invalid={error ? 'true' : undefined}
      />
      <p className="ps-hint">
        Public and permanent. Answer the substance rather than the tone, because the next driver is
        reading both.
      </p>
      {error && <p className="ps-error">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="ps-btn ps-btn-primary text-sm" disabled={busy}>
          {busy ? 'Posting...' : 'Post reply'}
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
    </form>
  );
}
