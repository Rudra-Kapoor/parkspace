'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, cn } from '@/components/ui';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { metresToMm, dayName } from '@/lib/dashboard';
import {
  AMENITY_LABELS,
  CANCELLATION_POLICY_COPY,
  CANCELLATION_POLICY_LABELS,
  SPACE_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  type AccessMethod,
  type CancellationPolicy,
  type SpaceType,
  type VehicleType,
} from '@/lib/types';
import { fieldErrors, listingSubmitSchema, type FieldErrors } from '@/lib/validation';

/**
 * The listing wizard.
 *
 * Design decisions worth stating, because each one is a response to a way this
 * form fails in the wild:
 *
 *  - All state lives in one object and is mirrored into localStorage on every
 *    change. A host filling this in on a phone will be interrupted. Losing
 *    twenty minutes of typing to a phone call is the single biggest reason a
 *    long form is abandoned.
 *  - Each step validates before Next, so a mistake is caught next to the field
 *    that caused it rather than in a wall of errors at the end.
 *  - Height is mandatory for covered spaces. An unstated height limit is the
 *    most common reason a driver arrives at a garage and cannot get in, and
 *    that failure costs the host a refund, a bad review and a dispute.
 *  - Prices are typed in rupees and converted once, at the boundary. Nothing
 *    below this component ever sees a decimal rupee.
 */

const STORAGE_KEY = 'parkspace.listing-wizard.v1';

const HEIGHT_REQUIRED_TYPES: SpaceType[] = ['garage', 'basement', 'covered_lot', 'stack_parking'];

const ACCESS_METHOD_LABELS: Record<AccessMethod, string> = {
  open_access: 'Open access, the driver just parks',
  host_greets: 'I meet the driver',
  qr_code: 'QR code at a gate',
  pin_code: 'Keypad with a PIN',
  remote_gate: 'I open the gate remotely',
  smart_lock: 'Smart lock',
  plate_recognition: 'Number plate recognition',
};

const STEPS = [
  { key: 'location', title: 'Location', blurb: 'Where the space is' },
  { key: 'basics', title: 'Basics', blurb: 'What you are offering' },
  { key: 'size', title: 'Size and access', blurb: 'What fits, and how to get in' },
  { key: 'amenities', title: 'Amenities and rules', blurb: 'What is there, what is not allowed' },
  { key: 'availability', title: 'Availability', blurb: 'When it can be booked' },
  { key: 'pricing', title: 'Pricing', blurb: 'What it costs' },
  { key: 'review', title: 'Review', blurb: 'Check and submit' },
] as const;

interface DayWindow {
  enabled: boolean;
  start_time: string;
  end_time: string;
  ends_next_day: boolean;
}

interface WizardState {
  address_line: string;
  landmark: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  lat: string;
  lng: string;

  title: string;
  description: string;
  space_type: SpaceType;
  vehicle_types: VehicleType[];
  capacity: string;

  max_length_m: string;
  max_width_m: string;
  max_height_m: string;
  access_method: AccessMethod;
  access_instructions: string;
  access_pin: string;

  amenities: string[];
  rules: string[];
  ev_connector_type: string;
  ev_power_kw: string;

  availability: DayWindow[];

  price_hourly: string;
  price_daily: string;
  price_monthly: string;
  min_booking_minutes: string;
  max_booking_minutes: string;
  min_notice_minutes: string;
  instant_book: boolean;
  cancellation_policy: CancellationPolicy;
}

function defaultDay(enabled: boolean): DayWindow {
  return { enabled, start_time: '08:00', end_time: '20:00', ends_next_day: false };
}

function initialState(): WizardState {
  return {
    address_line: '',
    landmark: '',
    locality: '',
    city: '',
    state: '',
    postal_code: '',
    lat: '',
    lng: '',

    title: '',
    description: '',
    space_type: 'driveway',
    vehicle_types: ['hatchback', 'sedan'],
    capacity: '1',

    max_length_m: '',
    max_width_m: '',
    max_height_m: '',
    access_method: 'open_access',
    access_instructions: '',
    access_pin: '',

    amenities: [],
    rules: [],
    ev_connector_type: '',
    ev_power_kw: '',

    availability: Array.from({ length: 7 }, (_, index) => defaultDay(index >= 1 && index <= 5)),

    price_hourly: '',
    price_daily: '',
    price_monthly: '',
    min_booking_minutes: '60',
    max_booking_minutes: '',
    min_notice_minutes: '0',
    instant_book: true,
    cancellation_policy: 'moderate',
  };
}

// ---------------------------------------------------------------------------
// Small parsing helpers. A blank field is "not stated", never zero.
// ---------------------------------------------------------------------------

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ---------------------------------------------------------------------------
// Per-step validation
// ---------------------------------------------------------------------------

function validateStep(step: number, state: WizardState): FieldErrors {
  const errors: FieldErrors = {};

  if (step === 0) {
    if (state.address_line.trim().length < 5) {
      errors.address_line = 'Enter the street address. Only you and a confirmed driver ever see it.';
    }
    if (state.locality.trim().length < 2) errors.locality = 'Enter the locality or neighbourhood';
    if (state.city.trim().length < 2) errors.city = 'Enter the city';
    if (state.state.trim().length < 2) errors.state = 'Enter the state';
    const lat = numberOrNull(state.lat);
    const lng = numberOrNull(state.lng);
    if (lat == null || lat < -90 || lat > 90) {
      errors.lat = 'Find the address on the map, or type a latitude between -90 and 90';
    }
    if (lng == null || lng < -180 || lng > 180) {
      errors.lng = 'Find the address on the map, or type a longitude between -180 and 180';
    }
  }

  if (step === 1) {
    const title = state.title.trim();
    if (title.length < 8) errors.title = 'Give your space a name of at least 8 characters';
    if (title.length > 120) errors.title = 'Keep the name under 120 characters';
    if (state.description.trim().length < 40) {
      errors.description =
        'Describe the space in at least 40 characters. Drivers book what they can picture.';
    }
    if (state.vehicle_types.length === 0) {
      errors.vehicle_types = 'Choose at least one type of vehicle you accept';
    }
    const capacity = numberOrNull(state.capacity);
    if (capacity == null || !Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
      errors.capacity = 'Enter how many vehicles can park at once, between 1 and 500';
    }
  }

  if (step === 2) {
    const checkMetres = (
      key: 'max_length_m' | 'max_width_m' | 'max_height_m',
      max: number,
      label: string,
    ) => {
      const value = numberOrNull(state[key]);
      if (value == null) return;
      if (value < 1 || value > max) {
        errors[key] = `${label} should be between 1 and ${max} metres`;
      }
    };
    checkMetres('max_length_m', 30, 'Length');
    checkMetres('max_width_m', 10, 'Width');
    checkMetres('max_height_m', 10, 'Height');

    if (HEIGHT_REQUIRED_TYPES.includes(state.space_type) && numberOrNull(state.max_height_m) == null) {
      errors.max_height_m =
        'A height limit is required for a covered space. An unstated height limit is the single most common reason a driver arrives and cannot park.';
    }
    if (state.access_method === 'pin_code' && state.access_pin.trim() === '') {
      errors.access_pin = 'Enter the PIN a driver will use. It is released only to a confirmed booking.';
    }
  }

  if (step === 3) {
    if (state.rules.some((rule) => rule.trim().length > 200)) {
      errors.rules = 'Keep each rule under 200 characters';
    }
    if (state.amenities.includes('ev_charging') && state.ev_connector_type.trim() === '') {
      errors.ev_connector_type = 'Say which connector you offer, for example Type 2 or CCS2';
    }
    const kw = numberOrNull(state.ev_power_kw);
    if (kw != null && (kw <= 0 || kw > 400)) errors.ev_power_kw = 'Enter a power between 0 and 400 kW';
  }

  if (step === 4) {
    const enabled = state.availability.filter((day) => day.enabled);
    if (enabled.length === 0) {
      errors.availability = 'Open at least one day, otherwise nobody can book this space';
    }
    state.availability.forEach((day, index) => {
      if (!day.enabled) return;
      if (!isValidTime(day.start_time) || !isValidTime(day.end_time)) {
        errors[`availability.${index}`] = `${dayName(index)}: enter times as HH:MM`;
        return;
      }
      if (!day.ends_next_day && day.end_time <= day.start_time) {
        errors[`availability.${index}`] =
          `${dayName(index)}: the end time must be after the start, or tick "ends next day"`;
      }
    });
  }

  if (step === 5) {
    const hourly = numberOrNull(state.price_hourly);
    const daily = numberOrNull(state.price_daily);
    const monthly = numberOrNull(state.price_monthly);
    if (hourly == null && daily == null && monthly == null) {
      errors.price_hourly = 'Set at least one price: hourly, daily or monthly';
    }
    for (const [key, value] of [
      ['price_hourly', hourly],
      ['price_daily', daily],
      ['price_monthly', monthly],
    ] as const) {
      if (value != null && value < 0) errors[key] = 'A price cannot be negative';
    }

    const minMinutes = numberOrNull(state.min_booking_minutes);
    if (minMinutes == null || minMinutes < 15 || minMinutes > 43_200) {
      errors.min_booking_minutes = 'The shortest stay must be between 15 minutes and 30 days';
    }
    const maxMinutes = numberOrNull(state.max_booking_minutes);
    if (maxMinutes != null && minMinutes != null && maxMinutes < minMinutes) {
      errors.max_booking_minutes = 'The longest stay cannot be shorter than the shortest';
    }
    const notice = numberOrNull(state.min_notice_minutes);
    if (notice == null || notice < 0 || notice > 10_080) {
      errors.min_notice_minutes = 'Notice must be between 0 minutes and 7 days';
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

interface AvailabilityPayload {
  day_of_week: number;
  start_time: string;
  end_time: string;
  ends_next_day: boolean;
}

function buildListingPayload(state: WizardState): Record<string, unknown> {
  const lengthM = numberOrNull(state.max_length_m);
  const widthM = numberOrNull(state.max_width_m);
  const heightM = numberOrNull(state.max_height_m);
  const hourly = numberOrNull(state.price_hourly);
  const daily = numberOrNull(state.price_daily);
  const monthly = numberOrNull(state.price_monthly);
  const maxMinutes = numberOrNull(state.max_booking_minutes);
  const evPower = numberOrNull(state.ev_power_kw);
  const hasEv = state.amenities.includes('ev_charging');

  return {
    title: state.title.trim(),
    description: state.description.trim(),
    address_line: state.address_line.trim(),
    landmark: textOrUndefined(state.landmark),
    locality: state.locality.trim(),
    city: state.city.trim(),
    state: state.state.trim(),
    postal_code: textOrUndefined(state.postal_code),
    lat: Number(state.lat),
    lng: Number(state.lng),
    space_type: state.space_type,
    vehicle_types: state.vehicle_types,
    capacity: Number(state.capacity),
    max_length_mm: lengthM != null ? metresToMm(lengthM) : undefined,
    max_width_mm: widthM != null ? metresToMm(widthM) : undefined,
    max_height_mm: heightM != null ? metresToMm(heightM) : undefined,
    amenities: state.amenities,
    rules: state.rules.map((rule) => rule.trim()).filter(Boolean),
    price_hourly_paise: hourly != null ? rupeesToPaise(hourly) : undefined,
    price_daily_paise: daily != null ? rupeesToPaise(daily) : undefined,
    price_monthly_paise: monthly != null ? rupeesToPaise(monthly) : undefined,
    min_booking_minutes: Number(state.min_booking_minutes),
    max_booking_minutes: maxMinutes ?? undefined,
    min_notice_minutes: Number(state.min_notice_minutes),
    max_advance_days: 90,
    instant_book: state.instant_book,
    cancellation_policy: state.cancellation_policy,
    access_method: state.access_method,
    access_instructions: textOrUndefined(state.access_instructions),
    access_pin: textOrUndefined(state.access_pin),
    has_ev_charging: hasEv,
    ev_connector_type: hasEv ? textOrUndefined(state.ev_connector_type) : undefined,
    ev_power_kw: hasEv && evPower != null ? evPower : undefined,
  };
}

function buildAvailabilityPayload(state: WizardState): AvailabilityPayload[] {
  return state.availability
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.enabled)
    .map(({ day, index }) => ({
      day_of_week: index,
      start_time: day.start_time,
      end_time: day.end_time,
      ends_next_day: day.ends_next_day,
    }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GeocodeHit {
  displayName: string;
  lat: number;
  lng: number;
  locality?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

export function ListingWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(initialState);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Restore once on mount. Anything that fails to parse is discarded silently:
  // a corrupt draft must never block the form.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: Partial<WizardState>; step?: number };
        if (parsed.state && typeof parsed.state === 'object') {
          setState((current) => ({
            ...current,
            ...parsed.state,
            availability:
              Array.isArray(parsed.state?.availability) && parsed.state.availability.length === 7
                ? parsed.state.availability
                : current.availability,
          }));
          setRestored(true);
        }
        if (typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step < STEPS.length) {
          setStep(parsed.step);
        }
      }
    } catch {
      // No usable draft. Start clean.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, step }));
    } catch {
      // Private browsing or a full quota. The form still works, it just will
      // not survive a refresh, and saying so would be noise at this point.
    }
  }, [state, step]);

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  }, []);

  const goTo = useCallback((next: number) => {
    setStep(next);
    setErrors({});
    // Move focus to the step heading so a screen reader announces the change
    // rather than leaving the user on a button that no longer exists.
    window.setTimeout(() => headingRef.current?.focus(), 0);
  }, []);

  function handleNext() {
    const stepErrors = validateStep(step, state);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  async function handleSubmit() {
    // Re-run every step, so a field edited on step 2 and invalidated later
    // cannot slip through because the user jumped straight to Review.
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const stepErrors = validateStep(index, state);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        goTo(index);
        return;
      }
    }

    const payload = buildListingPayload(state);
    const parsed = listingSubmitSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setSubmitError('Some details still need attention. The steps above show what.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/host/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, availability: buildAvailabilityPayload(state) }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        id?: string;
        message?: string;
        fields?: FieldErrors;
      };

      if (!response.ok || !body.ok) {
        if (body.fields) setErrors(body.fields);
        setSubmitError(body.message ?? 'We could not save that listing. Try again in a moment.');
        setSubmitting(false);
        return;
      }

      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to clean up.
      }
      router.push('/host/spaces');
      router.refresh();
    } catch {
      setSubmitError('We could not reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  function handleDiscard() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up.
    }
    setState(initialState());
    setRestored(false);
    goTo(0);
  }

  const current = STEPS[step] ?? STEPS[0];

  return (
    <div className="space-y-6">
      <ProgressBar step={step} onJump={goTo} />

      {restored && step < STEPS.length - 1 && (
        <Alert tone="info" title="We restored your draft">
          <p className="mt-1">
            Everything you typed before is still here.{' '}
            <button type="button" onClick={handleDiscard} className="font-semibold underline">
              Start again from scratch
            </button>
            .
          </p>
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {current.title}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{current.blurb}</p>

        <div className="mt-6">
          {step === 0 && <LocationStep state={state} update={update} errors={errors} />}
          {step === 1 && <BasicsStep state={state} update={update} errors={errors} />}
          {step === 2 && <SizeStep state={state} update={update} errors={errors} />}
          {step === 3 && <AmenitiesStep state={state} update={update} errors={errors} />}
          {step === 4 && <AvailabilityStep state={state} update={update} errors={errors} />}
          {step === 5 && <PricingStep state={state} update={update} errors={errors} />}
          {step === 6 && <ReviewStep state={state} onJump={goTo} />}
        </div>

        {submitError && (
          <div className="mt-6">
            <Alert tone="danger" title="That did not save">
              <p className="mt-1">{submitError}</p>
            </Alert>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <button
            type="button"
            className="ps-btn ps-btn-ghost"
            onClick={() => goTo(Math.max(step - 1, 0))}
            disabled={step === 0 || submitting}
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button type="button" className="ps-btn ps-btn-primary" onClick={handleNext}>
              Next
            </button>
          ) : (
            <button
              type="button"
              className="ps-btn ps-btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit for review'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function ProgressBar({ step, onJump }: { step: number; onJump: (next: number) => void }) {
  const percent = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">
          Step {step + 1} of {STEPS.length}
        </p>
        <p className="text-sm text-[var(--text-muted)]">{percent}% complete</p>
      </div>

      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Listing progress"
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="ps-scroll-x mt-3 flex gap-1.5 pb-1">
        {STEPS.map((entry, index) => (
          <li key={entry.key} className="shrink-0">
            <button
              type="button"
              onClick={() => index <= step && onJump(index)}
              disabled={index > step}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                index === step && 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]',
                index < step && 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]',
                index > step && 'cursor-not-allowed border-dashed border-[var(--border)] text-[var(--text-muted)] opacity-60',
              )}
            >
              {index + 1}. {entry.title}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="ps-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="ps-hint">{hint}</p>}
      {error && <p className="ps-error">{error}</p>}
    </div>
  );
}

type UpdateFn = <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;

interface StepProps {
  state: WizardState;
  update: UpdateFn;
  errors: FieldErrors;
}

// ---------------------------------------------------------------------------
// Step 1 - Location
// ---------------------------------------------------------------------------

function LocationStep({ state, update, errors }: StepProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  async function findOnMap() {
    const target = query.trim() || [state.address_line, state.locality, state.city].filter(Boolean).join(', ');
    if (target.trim().length < 3) {
      setSearchNote('Type an address or a landmark to search for');
      return;
    }

    setSearching(true);
    setSearchNote(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(target)}`);
      const body = (await response.json()) as { results?: GeocodeHit[] };
      const hits = body.results ?? [];
      setResults(hits);
      if (hits.length === 0) {
        setSearchNote('No match. Try a nearby landmark, or type the coordinates yourself.');
      }
    } catch {
      setSearchNote('The address lookup is not responding. You can type the coordinates instead.');
    } finally {
      setSearching(false);
    }
  }

  function choose(hit: GeocodeHit) {
    update('lat', hit.lat.toFixed(6));
    update('lng', hit.lng.toFixed(6));
    if (hit.locality && !state.locality) update('locality', hit.locality);
    if (hit.city && !state.city) update('city', hit.city);
    if (hit.state && !state.state) update('state', hit.state);
    if (hit.postcode && !state.postal_code) update('postal_code', hit.postcode);
    setResults([]);
    setSearchNote(`Pin set to ${hit.displayName}`);
  }

  return (
    <div className="space-y-5">
      <Alert tone="info" title="Your address stays private">
        <p className="mt-1">
          The map shows your space at a point 80 to 150 metres away from the real one. The exact
          address and any access instructions go only to a driver with a confirmed booking, and only
          from 24 hours before they arrive.
        </p>
      </Alert>

      <Field
        label="Street address"
        htmlFor="address_line"
        error={errors.address_line}
        hint="House or building number and street"
      >
        <input
          id="address_line"
          className="ps-input"
          value={state.address_line}
          aria-invalid={errors.address_line ? 'true' : undefined}
          onChange={(event) => update('address_line', event.target.value)}
          autoComplete="street-address"
        />
      </Field>

      <Field label="Landmark" htmlFor="landmark" hint="Optional. What a driver should look for.">
        <input
          id="landmark"
          className="ps-input"
          value={state.landmark}
          onChange={(event) => update('landmark', event.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Locality" htmlFor="locality" error={errors.locality}>
          <input
            id="locality"
            className="ps-input"
            value={state.locality}
            aria-invalid={errors.locality ? 'true' : undefined}
            onChange={(event) => update('locality', event.target.value)}
          />
        </Field>
        <Field label="City" htmlFor="city" error={errors.city}>
          <input
            id="city"
            className="ps-input"
            value={state.city}
            aria-invalid={errors.city ? 'true' : undefined}
            onChange={(event) => update('city', event.target.value)}
            autoComplete="address-level2"
          />
        </Field>
        <Field label="State" htmlFor="state" error={errors.state}>
          <input
            id="state"
            className="ps-input"
            value={state.state}
            aria-invalid={errors.state ? 'true' : undefined}
            onChange={(event) => update('state', event.target.value)}
            autoComplete="address-level1"
          />
        </Field>
        <Field label="PIN code" htmlFor="postal_code" hint="Optional">
          <input
            id="postal_code"
            className="ps-input"
            value={state.postal_code}
            onChange={(event) => update('postal_code', event.target.value)}
            autoComplete="postal-code"
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
        <h3 className="text-sm font-semibold">Put a pin on it</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Search for the address to set the coordinates. Getting the pin right is what decides
          whether a driver ends up at your gate or at the end of the street.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="ps-input flex-1"
            placeholder="Search an address or landmark"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void findOnMap();
              }
            }}
            aria-label="Search for an address"
          />
          <button
            type="button"
            className="ps-btn ps-btn-secondary"
            onClick={() => void findOnMap()}
            disabled={searching}
          >
            {searching ? 'Searching...' : 'Find on map'}
          </button>
        </div>

        {searchNote && <p className="ps-hint">{searchNote}</p>}

        {results.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {results.map((hit) => (
              <li key={`${hit.lat},${hit.lng},${hit.displayName}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]"
                  onClick={() => choose(hit)}
                >
                  {hit.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="lat" error={errors.lat}>
            <input
              id="lat"
              className="ps-input"
              value={state.lat}
              aria-invalid={errors.lat ? 'true' : undefined}
              onChange={(event) => update('lat', event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Longitude" htmlFor="lng" error={errors.lng}>
            <input
              id="lng"
              className="ps-input"
              value={state.lng}
              aria-invalid={errors.lng ? 'true' : undefined}
              onChange={(event) => update('lng', event.target.value)}
              inputMode="decimal"
            />
          </Field>
        </div>

        {state.lat && state.lng && (
          <p className="mt-3 text-sm">
            <span className="text-[var(--text-muted)]">Chosen coordinates: </span>
            <span className="font-mono font-semibold">
              {state.lat}, {state.lng}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 - Basics
// ---------------------------------------------------------------------------

function BasicsStep({ state, update, errors }: StepProps) {
  function toggleVehicle(type: VehicleType) {
    const next = state.vehicle_types.includes(type)
      ? state.vehicle_types.filter((value) => value !== type)
      : [...state.vehicle_types, type];
    update('vehicle_types', next);
  }

  return (
    <div className="space-y-5">
      <Field
        label="Listing name"
        htmlFor="title"
        error={errors.title}
        hint="What a driver sees first. For example: Covered garage bay off Park Street."
      >
        <input
          id="title"
          className="ps-input"
          value={state.title}
          aria-invalid={errors.title ? 'true' : undefined}
          onChange={(event) => update('title', event.target.value)}
          maxLength={120}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        error={errors.description}
        hint={`${state.description.trim().length} of at least 40 characters. Say how to find it, how tight the turn is, and anything you would want to know yourself.`}
      >
        <textarea
          id="description"
          className="ps-input min-h-32"
          value={state.description}
          aria-invalid={errors.description ? 'true' : undefined}
          onChange={(event) => update('description', event.target.value)}
          maxLength={4000}
        />
      </Field>

      <Field label="Type of space" htmlFor="space_type">
        <select
          id="space_type"
          className="ps-input"
          value={state.space_type}
          onChange={(event) => update('space_type', event.target.value as SpaceType)}
        >
          {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="ps-label">Vehicles you accept</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => {
            const checked = state.vehicle_types.includes(value as VehicleType);
            return (
              <label
                key={value}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  checked
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'border-[var(--border)]',
                )}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={checked}
                  onChange={() => toggleVehicle(value as VehicleType)}
                />
                {label}
              </label>
            );
          })}
        </div>
        {errors.vehicle_types && <p className="ps-error">{errors.vehicle_types}</p>}
      </fieldset>

      <Field
        label="How many vehicles at once"
        htmlFor="capacity"
        error={errors.capacity}
        hint="Each bay is booked independently, so a capacity of 3 can hold three separate bookings at the same time."
      >
        <input
          id="capacity"
          className="ps-input"
          value={state.capacity}
          aria-invalid={errors.capacity ? 'true' : undefined}
          onChange={(event) => update('capacity', event.target.value)}
          inputMode="numeric"
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 - Size and access
// ---------------------------------------------------------------------------

function SizeStep({ state, update, errors }: StepProps) {
  const heightRequired = HEIGHT_REQUIRED_TYPES.includes(state.space_type);

  return (
    <div className="space-y-5">
      {heightRequired && (
        <Alert tone="warning" title="A height limit is required for this type of space">
          <p className="mt-1">
            An unstated height limit is the most common reason a driver arrives and cannot park. A
            hatchback is about 1.5 m, an SUV about 1.8 m, and a roof box adds another 0.4 m.
            Measure the lowest point, including any beam or pipe across the entrance.
          </p>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Maximum length (metres)"
          htmlFor="max_length_m"
          error={errors.max_length_m}
          hint="Optional"
        >
          <input
            id="max_length_m"
            className="ps-input"
            value={state.max_length_m}
            aria-invalid={errors.max_length_m ? 'true' : undefined}
            onChange={(event) => update('max_length_m', event.target.value)}
            inputMode="decimal"
            placeholder="5.0"
          />
        </Field>
        <Field
          label="Maximum width (metres)"
          htmlFor="max_width_m"
          error={errors.max_width_m}
          hint="Optional"
        >
          <input
            id="max_width_m"
            className="ps-input"
            value={state.max_width_m}
            aria-invalid={errors.max_width_m ? 'true' : undefined}
            onChange={(event) => update('max_width_m', event.target.value)}
            inputMode="decimal"
            placeholder="2.4"
          />
        </Field>
        <Field
          label={heightRequired ? 'Maximum height (metres), required' : 'Maximum height (metres)'}
          htmlFor="max_height_m"
          error={errors.max_height_m}
          hint={heightRequired ? 'Measure the lowest obstruction' : 'Optional, but drivers of tall vehicles filter on it'}
        >
          <input
            id="max_height_m"
            className="ps-input"
            value={state.max_height_m}
            aria-invalid={errors.max_height_m ? 'true' : undefined}
            onChange={(event) => update('max_height_m', event.target.value)}
            inputMode="decimal"
            placeholder="2.1"
          />
        </Field>
      </div>

      <Field label="How does a driver get in" htmlFor="access_method">
        <select
          id="access_method"
          className="ps-input"
          value={state.access_method}
          onChange={(event) => update('access_method', event.target.value as AccessMethod)}
        >
          {Object.entries(ACCESS_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Access instructions"
        htmlFor="access_instructions"
        hint="Released only to a confirmed booking, from 24 hours before the stay. Be specific: which gate, which floor, which bay number."
      >
        <textarea
          id="access_instructions"
          className="ps-input min-h-24"
          value={state.access_instructions}
          onChange={(event) => update('access_instructions', event.target.value)}
          maxLength={2000}
        />
      </Field>

      <Field
        label="Access PIN"
        htmlFor="access_pin"
        error={errors.access_pin}
        hint="Optional unless you chose a keypad. Never shown publicly."
      >
        <input
          id="access_pin"
          className="ps-input"
          value={state.access_pin}
          aria-invalid={errors.access_pin ? 'true' : undefined}
          onChange={(event) => update('access_pin', event.target.value)}
          maxLength={30}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 - Amenities and rules
// ---------------------------------------------------------------------------

function AmenitiesStep({ state, update, errors }: StepProps) {
  const [draftRule, setDraftRule] = useState('');

  function toggleAmenity(key: string) {
    const next = state.amenities.includes(key)
      ? state.amenities.filter((value) => value !== key)
      : [...state.amenities, key];
    update('amenities', next);
  }

  function addRule() {
    const rule = draftRule.trim();
    if (rule === '') return;
    if (state.rules.length >= 20) return;
    update('rules', [...state.rules, rule]);
    setDraftRule('');
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="ps-label">What is there</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(AMENITY_LABELS).map(([key, label]) => {
            const checked = state.amenities.includes(key);
            return (
              <label
                key={key}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                  checked
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'border-[var(--border)]',
                )}
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={checked}
                  onChange={() => toggleAmenity(key)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {state.amenities.includes('ev_charging') && (
        <div className="grid gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-sunken)] p-4 sm:grid-cols-2">
          <Field
            label="Connector type"
            htmlFor="ev_connector_type"
            error={errors.ev_connector_type}
            hint="For example Type 2, CCS2 or a 15 A socket"
          >
            <input
              id="ev_connector_type"
              className="ps-input"
              value={state.ev_connector_type}
              aria-invalid={errors.ev_connector_type ? 'true' : undefined}
              onChange={(event) => update('ev_connector_type', event.target.value)}
            />
          </Field>
          <Field label="Power (kW)" htmlFor="ev_power_kw" error={errors.ev_power_kw} hint="Optional">
            <input
              id="ev_power_kw"
              className="ps-input"
              value={state.ev_power_kw}
              aria-invalid={errors.ev_power_kw ? 'true' : undefined}
              onChange={(event) => update('ev_power_kw', event.target.value)}
              inputMode="decimal"
            />
          </Field>
        </div>
      )}

      <div>
        <label className="ps-label" htmlFor="rule-draft">
          House rules
        </label>
        <p className="ps-hint mb-2">
          One line each. Anything a driver would be annoyed to discover on arrival belongs here.
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            id="rule-draft"
            className="ps-input flex-1"
            value={draftRule}
            placeholder="No overnight parking on Sundays"
            maxLength={200}
            onChange={(event) => setDraftRule(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addRule();
              }
            }}
          />
          <button
            type="button"
            className="ps-btn ps-btn-secondary"
            onClick={addRule}
            disabled={draftRule.trim() === '' || state.rules.length >= 20}
          >
            Add rule
          </button>
        </div>
        {errors.rules && <p className="ps-error">{errors.rules}</p>}

        {state.rules.length > 0 && (
          <ul className="mt-3 space-y-2">
            {state.rules.map((rule, index) => (
              <li
                key={`${index}-${rule}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words">{rule}</span>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                  onClick={() =>
                    update(
                      'rules',
                      state.rules.filter((_, position) => position !== index),
                    )
                  }
                  aria-label={`Remove rule: ${rule}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 - Availability
// ---------------------------------------------------------------------------

function AvailabilityStep({ state, update, errors }: StepProps) {
  function patchDay(index: number, patch: Partial<DayWindow>) {
    const next = state.availability.map((day, position) =>
      position === index ? { ...day, ...patch } : day,
    );
    update('availability', next);
  }

  function applyToAll() {
    const template = state.availability.find((day) => day.enabled) ?? defaultDay(true);
    update(
      'availability',
      state.availability.map(() => ({ ...template, enabled: true })),
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-muted)]">
        A space can only be booked inside the windows you declare here. You can close individual
        dates later from the calendar without touching this pattern.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="ps-btn ps-btn-secondary text-sm" onClick={applyToAll}>
          Same every day
        </button>
        <button
          type="button"
          className="ps-btn ps-btn-ghost text-sm"
          onClick={() =>
            update(
              'availability',
              state.availability.map((day) => ({
                ...day,
                start_time: '00:00',
                end_time: '23:59',
                ends_next_day: false,
                enabled: true,
              })),
            )
          }
        >
          Open 24 hours, every day
        </button>
      </div>

      {errors.availability && <p className="ps-error">{errors.availability}</p>}

      <ul className="space-y-3">
        {state.availability.map((day, index) => {
          const dayError = errors[`availability.${index}`];
          return (
            <li
              key={index}
              className={cn(
                'rounded-xl border p-3',
                day.enabled ? 'border-[var(--border-strong)]' : 'border-dashed border-[var(--border)]',
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={day.enabled}
                    onChange={(event) => patchDay(index, { enabled: event.target.checked })}
                  />
                  {dayName(index)}
                </label>

                {day.enabled ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      className="ps-input w-32"
                      value={day.start_time}
                      aria-label={`${dayName(index)} opens at`}
                      onChange={(event) => patchDay(index, { start_time: event.target.value })}
                    />
                    <span className="text-sm text-[var(--text-muted)]">to</span>
                    <input
                      type="time"
                      className="ps-input w-32"
                      value={day.end_time}
                      aria-label={`${dayName(index)} closes at`}
                      onChange={(event) => patchDay(index, { end_time: event.target.value })}
                    />
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={day.ends_next_day}
                        onChange={(event) => patchDay(index, { ends_next_day: event.target.checked })}
                      />
                      Ends next day
                    </label>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">Closed</span>
                )}
              </div>
              {dayError && <p className="ps-error">{dayError}</p>}
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-[var(--text-muted)]">
        An overnight window such as 20:00 to 08:00 is one window with "ends next day" ticked, not
        two separate ones.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 - Pricing
// ---------------------------------------------------------------------------

function PricingStep({ state, update, errors }: StepProps) {
  const hourly = numberOrNull(state.price_hourly);
  const commissionPreview = hourly != null && hourly > 0 ? rupeesToPaise(hourly) : null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-muted)]">
        Enter prices in rupees. ParkSpace keeps 10 percent of what a driver pays for the space, and
        the rest is yours.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Per hour" htmlFor="price_hourly" error={errors.price_hourly} hint="Leave blank if not offered">
          <input
            id="price_hourly"
            className="ps-input"
            value={state.price_hourly}
            aria-invalid={errors.price_hourly ? 'true' : undefined}
            onChange={(event) => update('price_hourly', event.target.value)}
            inputMode="decimal"
            placeholder="40"
          />
        </Field>
        <Field label="Per day" htmlFor="price_daily" error={errors.price_daily} hint="Leave blank if not offered">
          <input
            id="price_daily"
            className="ps-input"
            value={state.price_daily}
            aria-invalid={errors.price_daily ? 'true' : undefined}
            onChange={(event) => update('price_daily', event.target.value)}
            inputMode="decimal"
            placeholder="300"
          />
        </Field>
        <Field
          label="Per month"
          htmlFor="price_monthly"
          error={errors.price_monthly}
          hint="Leave blank if not offered"
        >
          <input
            id="price_monthly"
            className="ps-input"
            value={state.price_monthly}
            aria-invalid={errors.price_monthly ? 'true' : undefined}
            onChange={(event) => update('price_monthly', event.target.value)}
            inputMode="decimal"
            placeholder="5000"
          />
        </Field>
      </div>

      {commissionPreview != null && (
        <Alert tone="info" title="What an hour pays you">
          <p className="mt-1">
            A one hour booking at {formatPaise(commissionPreview)} pays you{' '}
            <strong>{formatPaise(commissionPreview - Math.round(commissionPreview * 0.1))}</strong>{' '}
            after the 10 percent commission. The driver also pays a service fee on top, which does
            not come out of your share.
          </p>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Shortest stay (minutes)"
          htmlFor="min_booking_minutes"
          error={errors.min_booking_minutes}
        >
          <input
            id="min_booking_minutes"
            className="ps-input"
            value={state.min_booking_minutes}
            aria-invalid={errors.min_booking_minutes ? 'true' : undefined}
            onChange={(event) => update('min_booking_minutes', event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="Longest stay (minutes)"
          htmlFor="max_booking_minutes"
          error={errors.max_booking_minutes}
          hint="Optional"
        >
          <input
            id="max_booking_minutes"
            className="ps-input"
            value={state.max_booking_minutes}
            aria-invalid={errors.max_booking_minutes ? 'true' : undefined}
            onChange={(event) => update('max_booking_minutes', event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="Notice you need (minutes)"
          htmlFor="min_notice_minutes"
          error={errors.min_notice_minutes}
          hint="Stops a booking landing three minutes before arrival"
        >
          <input
            id="min_notice_minutes"
            className="ps-input"
            value={state.min_notice_minutes}
            aria-invalid={errors.min_notice_minutes ? 'true' : undefined}
            onChange={(event) => update('min_notice_minutes', event.target.value)}
            inputMode="numeric"
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-4">
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          checked={state.instant_book}
          onChange={(event) => update('instant_book', event.target.checked)}
        />
        <span>
          <span className="block font-semibold">Instant book</span>
          <span className="block text-sm text-[var(--text-muted)]">
            A driver books without waiting for you to accept. Listings with instant book on get
            noticeably more bookings, because most searches happen minutes before the drive.
          </span>
        </span>
      </label>

      <fieldset>
        <legend className="ps-label">Cancellation policy</legend>
        <div className="space-y-2">
          {(Object.keys(CANCELLATION_POLICY_LABELS) as CancellationPolicy[]).map((policy) => (
            <label
              key={policy}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3',
                state.cancellation_policy === policy
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)]',
              )}
            >
              <input
                type="radio"
                name="cancellation_policy"
                className="mt-0.5 size-4"
                value={policy}
                checked={state.cancellation_policy === policy}
                onChange={() => update('cancellation_policy', policy)}
              />
              <span>
                <span className="block font-semibold">{CANCELLATION_POLICY_LABELS[policy]}</span>
                <span className="block text-sm text-[var(--text-muted)]">
                  {CANCELLATION_POLICY_COPY[policy]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7 - Review
// ---------------------------------------------------------------------------

function ReviewStep({ state, onJump }: { state: WizardState; onJump: (step: number) => void }) {
  const hourly = numberOrNull(state.price_hourly);
  const daily = numberOrNull(state.price_daily);
  const monthly = numberOrNull(state.price_monthly);
  const openDays = state.availability
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.enabled);

  return (
    <div className="space-y-5">
      <Alert tone="info" title="What happens next">
        <p className="mt-1">
          Submitting sends the listing to moderation. We check the address, the photos and the price
          before it goes live, usually within a working day. You can keep editing it in the
          meantime.
        </p>
      </Alert>

      <ReviewSection title="Location" onEdit={() => onJump(0)}>
        <ReviewRow label="Address">{state.address_line || 'Not set'}</ReviewRow>
        {state.landmark && <ReviewRow label="Landmark">{state.landmark}</ReviewRow>}
        <ReviewRow label="Area">
          {[state.locality, state.city, state.state].filter(Boolean).join(', ') || 'Not set'}
        </ReviewRow>
        <ReviewRow label="Coordinates">
          <span className="font-mono">
            {state.lat || '?'}, {state.lng || '?'}
          </span>
        </ReviewRow>
      </ReviewSection>

      <ReviewSection title="Basics" onEdit={() => onJump(1)}>
        <ReviewRow label="Name">{state.title || 'Not set'}</ReviewRow>
        <ReviewRow label="Type">{SPACE_TYPE_LABELS[state.space_type]}</ReviewRow>
        <ReviewRow label="Vehicles">
          {state.vehicle_types.map((type) => VEHICLE_TYPE_LABELS[type]).join(', ') || 'None chosen'}
        </ReviewRow>
        <ReviewRow label="Bays">{state.capacity}</ReviewRow>
        <ReviewRow label="Description">
          <span className="whitespace-pre-line">{state.description || 'Not set'}</span>
        </ReviewRow>
      </ReviewSection>

      <ReviewSection title="Size and access" onEdit={() => onJump(2)}>
        <ReviewRow label="Length">
          {state.max_length_m ? `${state.max_length_m} m` : 'Not stated'}
        </ReviewRow>
        <ReviewRow label="Width">
          {state.max_width_m ? `${state.max_width_m} m` : 'Not stated'}
        </ReviewRow>
        <ReviewRow label="Height">
          {state.max_height_m ? `${state.max_height_m} m` : 'Not stated'}
        </ReviewRow>
        <ReviewRow label="Access">{ACCESS_METHOD_LABELS[state.access_method]}</ReviewRow>
        {state.access_instructions && (
          <ReviewRow label="Instructions">
            <span className="whitespace-pre-line">{state.access_instructions}</span>
          </ReviewRow>
        )}
      </ReviewSection>

      <ReviewSection title="Amenities and rules" onEdit={() => onJump(3)}>
        <ReviewRow label="Amenities">
          {state.amenities.length > 0
            ? state.amenities.map((key) => AMENITY_LABELS[key] ?? key).join(', ')
            : 'None listed'}
        </ReviewRow>
        <ReviewRow label="Rules">
          {state.rules.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {state.rules.map((rule, index) => (
                <li key={`${index}-${rule}`}>{rule}</li>
              ))}
            </ul>
          ) : (
            'None listed'
          )}
        </ReviewRow>
      </ReviewSection>

      <ReviewSection title="Availability" onEdit={() => onJump(4)}>
        {openDays.length === 0 ? (
          <ReviewRow label="Open">Never, no day is enabled</ReviewRow>
        ) : (
          openDays.map(({ day, index }) => (
            <ReviewRow key={index} label={dayName(index)}>
              {day.start_time} to {day.end_time}
              {day.ends_next_day ? ' the next day' : ''}
            </ReviewRow>
          ))
        )}
      </ReviewSection>

      <ReviewSection title="Pricing" onEdit={() => onJump(5)}>
        <ReviewRow label="Hourly">
          {hourly != null ? formatPaise(rupeesToPaise(hourly)) : 'Not offered'}
        </ReviewRow>
        <ReviewRow label="Daily">
          {daily != null ? formatPaise(rupeesToPaise(daily)) : 'Not offered'}
        </ReviewRow>
        <ReviewRow label="Monthly">
          {monthly != null ? formatPaise(rupeesToPaise(monthly)) : 'Not offered'}
        </ReviewRow>
        <ReviewRow label="Stay length">
          {state.min_booking_minutes} minutes minimum
          {state.max_booking_minutes ? `, ${state.max_booking_minutes} minutes maximum` : ''}
        </ReviewRow>
        <ReviewRow label="Notice">{state.min_notice_minutes} minutes</ReviewRow>
        <ReviewRow label="Instant book">{state.instant_book ? 'On' : 'Off'}</ReviewRow>
        <ReviewRow label="Cancellation">
          {CANCELLATION_POLICY_LABELS[state.cancellation_policy]}
          {'. '}
          {CANCELLATION_POLICY_COPY[state.cancellation_policy]}
        </ReviewRow>
      </ReviewSection>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {title}
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold text-[var(--accent-text)] hover:underline"
        >
          Edit
        </button>
      </div>
      <dl className="mt-3 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}
