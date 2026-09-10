'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DISPUTE_CATEGORY_LABELS } from '@/lib/types';
import type { BookingMessage, DisputeCategory } from '@/lib/types';
import { Alert, Card, cn } from './ui';

/**
 * The booking conversation, plus the report-a-problem flow.
 *
 * These live together because they are the same moment from the user's point of
 * view: something is not right and they need to reach somebody. Splitting them
 * across two pages makes a person in a car park at night hunt for the right one.
 */
export function BookingThread({
  bookingId,
  currentUserId,
  counterpartyName,
  canDispute,
}: {
  bookingId: string;
  currentUserId: string;
  counterpartyName: string;
  canDispute: boolean;
}) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/messages?booking_id=${bookingId}`, { cache: 'no-store' });
      const data = await response.json();
      if (data.ok) setMessages(data.messages);
    } catch {
      // Leave whatever is already on screen.
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    // Poll rather than subscribe. Realtime would be nicer, and it would add a
    // connection to manage for a thread that is usually three messages long.
    const timer = setInterval(() => void load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, body }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? 'That message did not send.');
        return;
      }

      setMessages((current) => [...current, data.message]);
      setDraft('');
    } catch {
      setError('We could not reach the server. Check your connection.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Message {counterpartyName}</h2>
        {canDispute && (
          <button
            type="button"
            onClick={() => setReporting((v) => !v)}
            className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
          >
            Report a problem
          </button>
        )}
      </div>

      {reporting && (
        <div className="mt-4">
          <DisputeForm bookingId={bookingId} onDone={() => setReporting(false)} />
        </div>
      )}

      <div className="mt-4 max-h-80 space-y-2.5 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No messages yet. Ask anything about getting in, where exactly to park, or
            anything else you need.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            return (
              <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                    mine
                      ? 'rounded-br-sm bg-[var(--accent)] text-white'
                      : 'rounded-bl-sm bg-[var(--surface-sunken)]',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p className={cn('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-[var(--text-muted)]')}>
                    {new Date(message.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {messages.some((m) => m.redacted) && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Phone numbers and email addresses are hidden in messages. Keeping the
          arrangement here is what lets us help if something goes wrong.
        </p>
      )}

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      <form onSubmit={send} className="mt-4 flex gap-2">
        <label htmlFor="message-body" className="sr-only">
          Your message
        </label>
        <input
          id="message-body"
          type="text"
          className="ps-input"
          placeholder="Type a message"
          maxLength={4000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="ps-btn ps-btn-primary shrink-0"
        >
          {sending ? 'Sending' : 'Send'}
        </button>
      </form>
    </Card>
  );
}

function DisputeForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [category, setCategory] = useState<DisputeCategory>('space_unavailable');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (description.trim().length < 10) {
      setError('Tell us a little more about what happened, at least 10 characters.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          category,
          description: description.trim(),
          evidence_paths: [],
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.message ?? 'We could not log that report.');
        return;
      }

      setDone(true);
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title="Report logged">
        <p className="mt-1">
          Somebody will look at this. If you are somewhere unsafe right now, do not wait
          for us: get to a safe place first and contact the local authorities if you need
          to.
        </p>
        <button type="button" onClick={onDone} className="ps-btn ps-btn-secondary mt-3">
          Close
        </button>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4">
      <h3 className="font-semibold">What went wrong?</h3>

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-3">
        <label htmlFor="dispute-category" className="ps-label">
          The problem
        </label>
        <select
          id="dispute-category"
          className="ps-input !text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value as DisputeCategory)}
        >
          {(Object.keys(DISPUTE_CATEGORY_LABELS) as DisputeCategory[]).map((key) => (
            <option key={key} value={key}>
              {DISPUTE_CATEGORY_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <label htmlFor="dispute-description" className="ps-label">
          What happened
        </label>
        <textarea
          id="dispute-description"
          rows={4}
          maxLength={4000}
          className="ps-input resize-y !text-sm"
          placeholder="Give us the details. Times, what you saw, and anything you were told."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <p className="ps-hint">
        Safety problems and blocked vehicles are looked at first, ahead of anything about
        money.
      </p>

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="ps-btn ps-btn-primary">
          {busy ? 'Sending...' : 'Send report'}
        </button>
        <button type="button" onClick={onDone} className="ps-btn ps-btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
