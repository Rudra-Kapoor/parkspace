'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import type { FieldErrors } from '@/lib/validation';

export interface SettingRow {
  key: string;
  /** The stored JSON, serialised for the input. */
  value: string;
  description: string | null;
  updated_at: string | null;
  /** A sentence explaining, in business terms, what changing this does. */
  effect: string;
}

/**
 * The settings editor.
 *
 * Only changed fields are sent, and the button reports how many there are, so
 * an admin who came to change the commission cannot accidentally rewrite every
 * other value to whatever happened to be in the form.
 */
export function SettingsForm({ settings, canEdit }: { settings: SettingRow[]; canEdit: boolean }) {
  const router = useRouter();
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const setting of settings) map[setting.key] = setting.value;
    return map;
  }, [settings]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const changed = settings.filter((setting) => (values[setting.key] ?? '') !== setting.value);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSavedCount(null);

    if (changed.length === 0) {
      setFormError('Nothing has changed.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: changed.map((setting) => ({
            key: setting.key,
            value: values[setting.key] ?? setting.value,
          })),
        }),
      });

      const body = (await response.json()) as {
        ok?: boolean;
        applied?: Array<{ key: string }>;
        fields?: FieldErrors;
        message?: string;
      };

      if (body.fields) setErrors(body.fields);
      if (!response.ok) {
        setFormError(body.message ?? 'Those settings were not saved.');
        return;
      }

      setSavedCount(body.applied?.length ?? 0);
      if (body.message) setFormError(body.message);
      router.refresh();
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ul className="space-y-4">
        {settings.map((setting) => {
          const isChanged = (values[setting.key] ?? '') !== setting.value;
          return (
            <li
              key={setting.key}
              className={`rounded-xl border p-4 ${
                isChanged ? 'border-[var(--accent)]' : 'border-[var(--border)]'
              }`}
            >
              <label className="ps-label font-mono text-xs" htmlFor={`setting-${setting.key}`}>
                {setting.key}
              </label>
              <input
                id={`setting-${setting.key}`}
                className="ps-input font-mono"
                value={values[setting.key] ?? ''}
                disabled={!canEdit}
                aria-invalid={errors[setting.key] ? 'true' : undefined}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [setting.key]: event.target.value }))
                }
              />
              {errors[setting.key] && <p className="ps-error">{errors[setting.key]}</p>}
              {setting.description && (
                <p className="ps-hint">{setting.description}</p>
              )}
              <p className="mt-1 text-xs text-[var(--text-muted)]">{setting.effect}</p>
              {isChanged && (
                <p className="mt-1 text-xs font-semibold text-[var(--accent-text)]">
                  Changed from {setting.value}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {formError && (
        <Alert tone="warning" title="Note">
          <p className="mt-1">{formError}</p>
        </Alert>
      )}

      {savedCount != null && savedCount > 0 && (
        <Alert tone="success" title="Saved">
          <p className="mt-1">
            {savedCount} {savedCount === 1 ? 'setting' : 'settings'} updated. Every change was
            written to the audit log with its previous value.
          </p>
        </Alert>
      )}

      {canEdit ? (
        <button type="submit" className="ps-btn ps-btn-primary" disabled={busy || changed.length === 0}>
          {busy
            ? 'Saving...'
            : changed.length === 0
              ? 'No changes to save'
              : `Save ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}`}
        </button>
      ) : (
        <Alert tone="info" title="Read only">
          <p className="mt-1">
            Support accounts can see these values but cannot change them. Commission, fees and hold
            durations are full admin decisions.
          </p>
        </Alert>
      )}
    </form>
  );
}
