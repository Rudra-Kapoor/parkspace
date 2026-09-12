'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, cn } from '@/components/ui';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { metresToMm } from '@/lib/dashboard';
import {
  AMENITY_LABELS,
  CANCELLATION_POLICY_COPY,
  CANCELLATION_POLICY_LABELS,
  SPACE_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  type CancellationPolicy,
  type SpaceType,
  type VehicleType,
} from '@/lib/types';
import type { FieldErrors } from '@/lib/validation';

export interface EditableSpace {
  id: string;
  status: string;
  title: string;
  description: string;
  address_line: string;
  landmark: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  lat: string;
  lng: string;
  space_type: SpaceType;
  vehicle_types: VehicleType[];
  capacity: string;
  max_length_m: string;
  max_width_m: string;
  max_height_m: string;
  amenities: string[];
  rules: string[];
  price_hourly: string;
  price_daily: string;
  price_monthly: string;
  min_booking_minutes: string;
  max_booking_minutes: string;
  min_notice_minutes: string;
  instant_book: boolean;
  cancellation_policy: CancellationPolicy;
}

const HEIGHT_REQUIRED_TYPES: SpaceType[] = ['garage', 'basement', 'covered_lot', 'stack_parking'];

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Edit a listing.
 *
 * Deliberately one page rather than the seven step wizard. A wizard is right
 * for the first pass, when the host does not know what they will be asked; it
 * is wrong for changing a price, when they know exactly which field they came
 * for and every extra step is an obstacle.
 */
export function EditListingForm({ initial }: { initial: EditableSpace }) {
  const router = useRouter();
  const [values, setValues] = useState<EditableSpace>(initial);
  const [draftRule, setDraftRule] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof EditableSpace>(key: K, value: EditableSpace[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (values.title.trim().length < 8) next.title = 'At least 8 characters';
    if (values.description.trim().length < 40) {
      next.description = 'At least 40 characters before this can go live';
    }
    if (values.address_line.trim().length < 5) next.address_line = 'Enter the street address';
    if (values.locality.trim().length < 2) next.locality = 'Enter the locality';
    if (values.city.trim().length < 2) next.city = 'Enter the city';
    if (values.state.trim().length < 2) next.state = 'Enter the state';

    const lat = numberOrNull(values.lat);
    const lng = numberOrNull(values.lng);
    if (lat == null || lat < -90 || lat > 90) next.lat = 'Enter a latitude between -90 and 90';
    if (lng == null || lng < -180 || lng > 180) next.lng = 'Enter a longitude between -180 and 180';

    if (values.vehicle_types.length === 0) next.vehicle_types = 'Choose at least one vehicle type';

    const capacity = numberOrNull(values.capacity);
    if (capacity == null || capacity < 1 || capacity > 500) next.capacity = 'Between 1 and 500';

    if (
      HEIGHT_REQUIRED_TYPES.includes(values.space_type) &&
      numberOrNull(values.max_height_m) == null
    ) {
      next.max_height_m =
        'A height limit is required for a covered space. An unstated limit is the most common reason a driver arrives and cannot park.';
    }

    const hourly = numberOrNull(values.price_hourly);
    const daily = numberOrNull(values.price_daily);
    const monthly = numberOrNull(values.price_monthly);
    if (hourly == null && daily == null && monthly == null) {
      next.price_hourly = 'Set at least one price';
    }

    const minMinutes = numberOrNull(values.min_booking_minutes);
    if (minMinutes == null || minMinutes < 15) next.min_booking_minutes = 'At least 15 minutes';

    const maxMinutes = numberOrNull(values.max_booking_minutes);
    if (maxMinutes != null && minMinutes != null && maxMinutes < minMinutes) {
      next.max_booking_minutes = 'Cannot be shorter than the minimum';
    }

    return next;
  }

  async function patch(payload: Record<string, unknown>, note: string) {
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/host/spaces/${values.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        status?: string;
        message?: string;
        fields?: FieldErrors;
      };
      if (!response.ok || !body.ok) {
        if (body.fields) setErrors(body.fields);
        setFormError(body.message ?? note);
        return false;
      }
      if (body.status) update('status', body.status);
      setSaved(true);
      router.refresh();
      return true;
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError('Some details need attention.');
      return;
    }

    const lengthM = numberOrNull(values.max_length_m);
    const widthM = numberOrNull(values.max_width_m);
    const heightM = numberOrNull(values.max_height_m);
    const hourly = numberOrNull(values.price_hourly);
    const daily = numberOrNull(values.price_daily);
    const monthly = numberOrNull(values.price_monthly);
    const maxMinutes = numberOrNull(values.max_booking_minutes);

    await patch(
      {
        title: values.title.trim(),
        description: values.description.trim(),
        address_line: values.address_line.trim(),
        landmark: values.landmark.trim(),
        locality: values.locality.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        postal_code: values.postal_code.trim(),
        lat: Number(values.lat),
        lng: Number(values.lng),
        space_type: values.space_type,
        vehicle_types: values.vehicle_types,
        capacity: Number(values.capacity),
        max_length_mm: lengthM != null ? metresToMm(lengthM) : null,
        max_width_mm: widthM != null ? metresToMm(widthM) : null,
        max_height_mm: heightM != null ? metresToMm(heightM) : null,
        amenities: values.amenities,
        rules: values.rules,
        price_hourly_paise: hourly != null ? rupeesToPaise(hourly) : null,
        price_daily_paise: daily != null ? rupeesToPaise(daily) : null,
        price_monthly_paise: monthly != null ? rupeesToPaise(monthly) : null,
        min_booking_minutes: Number(values.min_booking_minutes),
        max_booking_minutes: maxMinutes,
        min_notice_minutes: Number(values.min_notice_minutes) || 0,
        instant_book: values.instant_book,
        cancellation_policy: values.cancellation_policy,
      },
      'We could not save those changes.',
    );
  }

  async function delist() {
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/host/spaces/${values.id}`, { method: 'DELETE' });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !body.ok) {
        setFormError(body.message ?? 'We could not delist that listing.');
        return;
      }
      update('status', 'delisted');
      router.refresh();
    } catch {
      setFormError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  function toggle<K extends 'amenities' | 'vehicle_types'>(key: K, value: string) {
    const current = values[key] as string[];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    update(key, next as EditableSpace[K]);
  }

  const hourly = numberOrNull(values.price_hourly);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Listing state
        </h2>
        <p className="mt-2 text-sm">
          This listing is <strong>{values.status.replace(/_/g, ' ')}</strong>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {values.status === 'active' && (
            <button
              type="button"
              className="ps-btn ps-btn-secondary text-sm"
              disabled={busy}
              onClick={() => void patch({ status: 'paused' }, 'We could not pause that listing.')}
            >
              Pause bookings
            </button>
          )}
          {values.status === 'paused' && (
            <button
              type="button"
              className="ps-btn ps-btn-primary text-sm"
              disabled={busy}
              onClick={() => void patch({ status: 'active' }, 'We could not resume that listing.')}
            >
              Resume bookings
            </button>
          )}
          {(values.status === 'rejected' || values.status === 'draft') && (
            <button
              type="button"
              className="ps-btn ps-btn-primary text-sm"
              disabled={busy}
              onClick={() =>
                void patch({ status: 'pending_review' }, 'We could not submit that listing.')
              }
            >
              Submit for review
            </button>
          )}
          {values.status !== 'delisted' && (
            <button type="button" className="ps-btn ps-btn-danger text-sm" disabled={busy} onClick={() => void delist()}>
              Delist
            </button>
          )}
        </div>
        <p className="ps-hint">
          Delisting removes the space from search and stops new bookings. It is not a delete:
          existing bookings, receipts and reviews still point at this listing and have to keep
          working.
        </p>
      </Card>

      <form onSubmit={submit} className="space-y-6">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">The basics</h2>
          <div className="mt-4 space-y-4">
            <Field label="Listing name" htmlFor="title" error={errors.title}>
              <input
                id="title"
                className="ps-input"
                value={values.title}
                onChange={(event) => update('title', event.target.value)}
                maxLength={120}
              />
            </Field>

            <Field label="Description" htmlFor="description" error={errors.description}>
              <textarea
                id="description"
                className="ps-input min-h-32"
                value={values.description}
                onChange={(event) => update('description', event.target.value)}
                maxLength={4000}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type of space" htmlFor="space_type">
                <select
                  id="space_type"
                  className="ps-input"
                  value={values.space_type}
                  onChange={(event) => update('space_type', event.target.value as SpaceType)}
                >
                  {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bays" htmlFor="capacity" error={errors.capacity}>
                <input
                  id="capacity"
                  className="ps-input"
                  value={values.capacity}
                  onChange={(event) => update('capacity', event.target.value)}
                  inputMode="numeric"
                />
              </Field>
            </div>

            <fieldset>
              <legend className="ps-label">Vehicles you accept</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <Toggle
                    key={value}
                    checked={values.vehicle_types.includes(value as VehicleType)}
                    label={label}
                    onChange={() => toggle('vehicle_types', value)}
                  />
                ))}
              </div>
              {errors.vehicle_types && <p className="ps-error">{errors.vehicle_types}</p>}
            </fieldset>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Location</h2>
          <p className="ps-hint">
            Only you, an admin and a driver with a confirmed booking ever see the exact address.
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Street address" htmlFor="address_line" error={errors.address_line}>
              <input
                id="address_line"
                className="ps-input"
                value={values.address_line}
                onChange={(event) => update('address_line', event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Landmark" htmlFor="landmark">
                <input
                  id="landmark"
                  className="ps-input"
                  value={values.landmark}
                  onChange={(event) => update('landmark', event.target.value)}
                />
              </Field>
              <Field label="Locality" htmlFor="locality" error={errors.locality}>
                <input
                  id="locality"
                  className="ps-input"
                  value={values.locality}
                  onChange={(event) => update('locality', event.target.value)}
                />
              </Field>
              <Field label="City" htmlFor="city" error={errors.city}>
                <input
                  id="city"
                  className="ps-input"
                  value={values.city}
                  onChange={(event) => update('city', event.target.value)}
                />
              </Field>
              <Field label="State" htmlFor="state" error={errors.state}>
                <input
                  id="state"
                  className="ps-input"
                  value={values.state}
                  onChange={(event) => update('state', event.target.value)}
                />
              </Field>
              <Field label="PIN code" htmlFor="postal_code">
                <input
                  id="postal_code"
                  className="ps-input"
                  value={values.postal_code}
                  onChange={(event) => update('postal_code', event.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <div />
              <Field label="Latitude" htmlFor="lat" error={errors.lat}>
                <input
                  id="lat"
                  className="ps-input"
                  value={values.lat}
                  onChange={(event) => update('lat', event.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Longitude" htmlFor="lng" error={errors.lng}>
                <input
                  id="lng"
                  className="ps-input"
                  value={values.lng}
                  onChange={(event) => update('lng', event.target.value)}
                  inputMode="decimal"
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Size</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Length (metres)" htmlFor="max_length_m">
              <input
                id="max_length_m"
                className="ps-input"
                value={values.max_length_m}
                onChange={(event) => update('max_length_m', event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Width (metres)" htmlFor="max_width_m">
              <input
                id="max_width_m"
                className="ps-input"
                value={values.max_width_m}
                onChange={(event) => update('max_width_m', event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Height (metres)" htmlFor="max_height_m" error={errors.max_height_m}>
              <input
                id="max_height_m"
                className="ps-input"
                value={values.max_height_m}
                onChange={(event) => update('max_height_m', event.target.value)}
                inputMode="decimal"
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Amenities and rules</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(AMENITY_LABELS).map(([key, label]) => (
              <Toggle
                key={key}
                checked={values.amenities.includes(key)}
                label={label}
                onChange={() => toggle('amenities', key)}
              />
            ))}
          </div>

          <div className="mt-5">
            <label className="ps-label" htmlFor="rule-draft">
              House rules
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="rule-draft"
                className="ps-input flex-1"
                value={draftRule}
                maxLength={200}
                onChange={(event) => setDraftRule(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (draftRule.trim()) {
                      update('rules', [...values.rules, draftRule.trim()]);
                      setDraftRule('');
                    }
                  }
                }}
              />
              <button
                type="button"
                className="ps-btn ps-btn-secondary"
                disabled={draftRule.trim() === ''}
                onClick={() => {
                  update('rules', [...values.rules, draftRule.trim()]);
                  setDraftRule('');
                }}
              >
                Add rule
              </button>
            </div>

            {values.rules.length > 0 && (
              <ul className="mt-3 space-y-2">
                {values.rules.map((rule, index) => (
                  <li
                    key={`${index}-${rule}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-words">{rule}</span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                      onClick={() =>
                        update(
                          'rules',
                          values.rules.filter((_, position) => position !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">Pricing</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Per hour (rupees)" htmlFor="price_hourly" error={errors.price_hourly}>
              <input
                id="price_hourly"
                className="ps-input"
                value={values.price_hourly}
                onChange={(event) => update('price_hourly', event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Per day (rupees)" htmlFor="price_daily">
              <input
                id="price_daily"
                className="ps-input"
                value={values.price_daily}
                onChange={(event) => update('price_daily', event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Per month (rupees)" htmlFor="price_monthly">
              <input
                id="price_monthly"
                className="ps-input"
                value={values.price_monthly}
                onChange={(event) => update('price_monthly', event.target.value)}
                inputMode="decimal"
              />
            </Field>
          </div>

          {hourly != null && hourly > 0 && (
            <p className="ps-hint">
              A one hour booking pays you{' '}
              {formatPaise(rupeesToPaise(hourly) - Math.round(rupeesToPaise(hourly) * 0.1))} after
              commission.
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field
              label="Shortest stay (minutes)"
              htmlFor="min_booking_minutes"
              error={errors.min_booking_minutes}
            >
              <input
                id="min_booking_minutes"
                className="ps-input"
                value={values.min_booking_minutes}
                onChange={(event) => update('min_booking_minutes', event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field
              label="Longest stay (minutes)"
              htmlFor="max_booking_minutes"
              error={errors.max_booking_minutes}
            >
              <input
                id="max_booking_minutes"
                className="ps-input"
                value={values.max_booking_minutes}
                onChange={(event) => update('max_booking_minutes', event.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Notice needed (minutes)" htmlFor="min_notice_minutes">
              <input
                id="min_notice_minutes"
                className="ps-input"
                value={values.min_notice_minutes}
                onChange={(event) => update('min_notice_minutes', event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-4">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={values.instant_book}
              onChange={(event) => update('instant_book', event.target.checked)}
            />
            <span>
              <span className="block font-semibold">Instant book</span>
              <span className="block text-sm text-[var(--text-muted)]">
                Drivers book without waiting for you to accept.
              </span>
            </span>
          </label>

          <fieldset className="mt-4">
            <legend className="ps-label">Cancellation policy</legend>
            <div className="space-y-2">
              {(Object.keys(CANCELLATION_POLICY_LABELS) as CancellationPolicy[]).map((policy) => (
                <label
                  key={policy}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3',
                    values.cancellation_policy === policy
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)]',
                  )}
                >
                  <input
                    type="radio"
                    name="cancellation_policy"
                    className="mt-0.5 size-4"
                    checked={values.cancellation_policy === policy}
                    onChange={() => update('cancellation_policy', policy)}
                  />
                  <span>
                    <span className="block font-semibold">
                      {CANCELLATION_POLICY_LABELS[policy]}
                    </span>
                    <span className="block text-sm text-[var(--text-muted)]">
                      {CANCELLATION_POLICY_COPY[policy]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        {formError && (
          <Alert tone="danger" title="That did not save">
            <p className="mt-1">{formError}</p>
          </Alert>
        )}

        {saved && (
          <Alert tone="success" title="Saved">
            <p className="mt-1">Your changes are live on the listing.</p>
          </Alert>
        )}

        <button type="submit" className="ps-btn ps-btn-primary" disabled={busy}>
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="ps-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error && <p className="ps-error">{error}</p>}
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        checked
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
          : 'border-[var(--border)]',
      )}
    >
      <input type="checkbox" className="size-4" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
