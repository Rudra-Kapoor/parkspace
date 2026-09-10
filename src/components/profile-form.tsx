'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { profileUpdateSchema, fieldErrors, type FieldErrors } from '@/lib/validation';
import type { Profile } from '@/lib/types';
import { Alert, Card } from './ui';

const CHANNELS: Array<[string, string]> = [
  ['push', 'Push notifications'],
  ['email', 'Email'],
  ['sms', 'SMS'],
  ['whatsapp', 'WhatsApp'],
  ['marketing', 'Occasional news about new areas and features'],
];

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [prefs, setPrefs] = useState<Record<string, boolean>>(profile.notification_prefs ?? {});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    setErrors({});

    const parsed = profileUpdateSchema.safeParse({ full_name: fullName, phone });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setBusy(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.full_name,
        phone: parsed.data.phone || null,
        notification_prefs: prefs,
      })
      .eq('id', profile.id);

    if (updateError) {
      setError(
        updateError.code === '23505'
          ? 'That phone number is already on another account.'
          : 'We could not save those changes. Try again.',
      );
      setBusy(false);
      return;
    }

    setSaved(true);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="p-5">
      <form onSubmit={save}>
        <h2 className="font-semibold">Your details</h2>

        {error && (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        )}
        {saved && (
          <Alert tone="success" className="mt-3">
            Saved.
          </Alert>
        )}

        <div className="mt-4">
          <label htmlFor="p-name" className="ps-label">
            Full name
          </label>
          <input
            id="p-name"
            type="text"
            className="ps-input"
            value={fullName}
            aria-invalid={Boolean(errors.full_name)}
            onChange={(event) => setFullName(event.target.value)}
          />
          {errors.full_name && <p className="ps-error">{errors.full_name}</p>}
          <p className="ps-hint">Hosts see this when you book.</p>
        </div>

        <div className="mt-4">
          <label htmlFor="p-phone" className="ps-label">
            Phone number
          </label>
          <input
            id="p-phone"
            type="tel"
            className="ps-input"
            placeholder="+91 98300 00000"
            value={phone}
            aria-invalid={Boolean(errors.phone)}
            onChange={(event) => setPhone(event.target.value)}
          />
          {errors.phone && <p className="ps-error">{errors.phone}</p>}
          <p className="ps-hint">
            Never shown to hosts. Messages go through the app, so nobody has to hand out a
            personal number.
          </p>
        </div>

        <fieldset className="mt-6 border-t pt-5">
          <legend className="font-semibold">How we contact you</legend>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Booking confirmations and reminders are queued but not yet delivered in this
            build. These preferences are stored for when delivery is wired up.
          </p>

          <div className="mt-3 space-y-2.5">
            {CHANNELS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={Boolean(prefs[key])}
                  onChange={(event) =>
                    setPrefs((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={busy} className="ps-btn ps-btn-primary mt-6">
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </Card>
  );
}
