'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import type { FieldErrors } from '@/lib/validation';

export interface HostProfileValues {
  display_name: string;
  bio: string;
  is_business: boolean;
  business_name: string;
  business_type: string;
}

const BUSINESS_TYPES = [
  'Residential society',
  'Office building',
  'Hotel',
  'Retail or mall',
  'Parking operator',
  'Hospital or institution',
  'Other',
];

/**
 * The host profile form.
 *
 * Posts to /api/host/profile, which upserts. The same endpoint handles the
 * first save and every one after it, so there is no "create" and "edit"
 * divergence to keep in step.
 */
export function HostProfileForm({ initial }: { initial: HostProfileValues }) {
  const router = useRouter();
  const [values, setValues] = useState<HostProfileValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update<K extends keyof HostProfileValues>(key: K, value: HostProfileValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const localErrors: FieldErrors = {};
    if (values.display_name.trim().length < 2) {
      localErrors.display_name = 'Enter the name drivers will see';
    }
    if (values.is_business && values.business_name.trim() === '') {
      localErrors.business_name = 'Enter the business name';
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/host/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: values.display_name.trim(),
          bio: values.bio.trim(),
          is_business: values.is_business,
          business_name: values.business_name.trim(),
          business_type: values.business_type.trim(),
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
        fields?: FieldErrors;
      };

      if (!response.ok || !body.ok) {
        if (body.fields) setErrors(body.fields);
        setFormError(body.message ?? 'We could not save that.');
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="ps-label" htmlFor="display_name">
          Host name
        </label>
        <input
          id="display_name"
          className="ps-input"
          value={values.display_name}
          aria-invalid={errors.display_name ? 'true' : undefined}
          onChange={(event) => update('display_name', event.target.value)}
          maxLength={100}
        />
        {errors.display_name ? (
          <p className="ps-error">{errors.display_name}</p>
        ) : (
          <p className="ps-hint">Shown next to every listing. Your legal name is never published.</p>
        )}
      </div>

      <div>
        <label className="ps-label" htmlFor="bio">
          About you
        </label>
        <textarea
          id="bio"
          className="ps-input min-h-28"
          value={values.bio}
          onChange={(event) => update('bio', event.target.value)}
          maxLength={1000}
        />
        <p className="ps-hint">
          A couple of sentences. Drivers handing over their car to a stranger read this, and a
          specific detail does more than a paragraph of adjectives.
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-4">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={values.is_business}
          onChange={(event) => update('is_business', event.target.checked)}
        />
        <span>
          <span className="block font-semibold">I am hosting as a business</span>
          <span className="block text-sm text-[var(--text-muted)]">
            Tick this if the space belongs to a company, a society or an operator rather than to you
            personally. It changes what verification we ask for and how invoices are issued.
          </span>
        </span>
      </label>

      {values.is_business && (
        <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-2">
          <div>
            <label className="ps-label" htmlFor="business_name">
              Business name
            </label>
            <input
              id="business_name"
              className="ps-input"
              value={values.business_name}
              aria-invalid={errors.business_name ? 'true' : undefined}
              onChange={(event) => update('business_name', event.target.value)}
              maxLength={200}
            />
            {errors.business_name && <p className="ps-error">{errors.business_name}</p>}
          </div>
          <div>
            <label className="ps-label" htmlFor="business_type">
              Type of business
            </label>
            <select
              id="business_type"
              className="ps-input"
              value={values.business_type}
              onChange={(event) => update('business_type', event.target.value)}
            >
              <option value="">Choose one</option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {formError && (
        <Alert tone="danger" title="That did not save">
          <p className="mt-1">{formError}</p>
        </Alert>
      )}

      {saved && (
        <Alert tone="success" title="Saved">
          <p className="mt-1">Your host profile is up to date.</p>
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="ps-btn ps-btn-primary" disabled={busy}>
          {busy ? 'Saving...' : 'Save host profile'}
        </button>
      </div>
    </form>
  );
}
