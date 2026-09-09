'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { VEHICLE_TYPE_LABELS, type Vehicle, type VehicleType } from '@/lib/types';
import { Alert, Badge, Card, EmptyState, cn } from './ui';

/**
 * Vehicle management.
 *
 * Dimensions are entered in metres and stored in millimetres. Nobody thinks
 * about their car in millimetres, and nobody should have to. The conversion
 * happens here so the database can keep an integer.
 *
 * There is a preset list because most people do not know their car's height, and
 * a field they cannot fill is a field they will skip, which then lets them book a
 * basement they cannot enter.
 */

const PRESETS: Array<{
  label: string;
  type: VehicleType;
  length: number;
  width: number;
  height: number;
}> = [
  { label: 'Scooter or motorcycle', type: 'two_wheeler', length: 1.9, width: 0.7, height: 1.1 },
  { label: 'Small hatchback', type: 'hatchback', length: 3.6, width: 1.6, height: 1.5 },
  { label: 'Large hatchback', type: 'hatchback', length: 4.0, width: 1.7, height: 1.55 },
  { label: 'Sedan', type: 'sedan', length: 4.4, width: 1.75, height: 1.5 },
  { label: 'Compact SUV', type: 'suv', length: 4.3, width: 1.8, height: 1.65 },
  { label: 'Full size SUV', type: 'suv', length: 4.9, width: 1.9, height: 1.85 },
];

export function VehicleManager({ initialVehicles }: { initialVehicles: Vehicle[] }) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [adding, setAdding] = useState(initialVehicles.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    registration_number: '',
    vehicle_type: 'hatchback' as VehicleType,
    make: '',
    model: '',
    colour: '',
    length_m: '',
    width_m: '',
    height_m: '',
    is_electric: false,
  });

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setForm((current) => ({
      ...current,
      vehicle_type: preset.type,
      length_m: String(preset.length),
      width_m: String(preset.width),
      height_m: String(preset.height),
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Your session expired. Sign in again.');
      setBusy(false);
      return;
    }

    const registration = form.registration_number.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (registration.length < 4) {
      setError('Enter the vehicle registration number.');
      setBusy(false);
      return;
    }

    const toMm = (value: string): number | null => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : null;
    };

    const { data, error: insertError } = await supabase
      .from('vehicles')
      .insert({
        owner_id: user.id,
        registration_number: registration,
        vehicle_type: form.vehicle_type,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        colour: form.colour.trim() || null,
        length_mm: toMm(form.length_m),
        width_mm: toMm(form.width_m),
        height_mm: toMm(form.height_m),
        is_electric: form.is_electric,
        is_default: vehicles.length === 0,
      })
      .select()
      .single();

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'That registration is already on your account.'
          : 'We could not save that vehicle. Check the details and try again.',
      );
      setBusy(false);
      return;
    }

    setVehicles((current) => [...current, data as Vehicle]);
    setForm({
      registration_number: '',
      vehicle_type: 'hatchback',
      make: '',
      model: '',
      colour: '',
      length_m: '',
      width_m: '',
      height_m: '',
      is_electric: false,
    });
    setAdding(false);
    setBusy(false);
    router.refresh();
  }

  async function makeDefault(id: string) {
    const supabase = createClient();
    await supabase.from('vehicles').update({ is_default: true }).eq('id', id);
    setVehicles((current) => current.map((v) => ({ ...v, is_default: v.id === id })));
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error: deleteError } = await supabase.from('vehicles').delete().eq('id', id);

    if (deleteError) {
      setError('That vehicle is attached to a booking, so it cannot be removed.');
      return;
    }

    setVehicles((current) => current.filter((v) => v.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {vehicles.length === 0 && !adding ? (
        <EmptyState
          title="No vehicles yet"
          description="Add the vehicle you will be parking so hosts can identify it."
          action={
            <button type="button" onClick={() => setAdding(true)} className="ps-btn ps-btn-primary">
              Add a vehicle
            </button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <Card className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold tracking-wide">
                      {vehicle.registration_number}
                    </span>
                    {vehicle.is_default && <Badge tone="accent">Default</Badge>}
                    {vehicle.is_electric && <Badge tone="success">Electric</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {[
                      VEHICLE_TYPE_LABELS[vehicle.vehicle_type],
                      vehicle.colour,
                      vehicle.make,
                      vehicle.model,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {vehicle.height_mm && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {(vehicle.height_mm / 1000).toFixed(2)} m tall
                      {vehicle.length_mm && <>, {(vehicle.length_mm / 1000).toFixed(2)} m long</>}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {!vehicle.is_default && (
                    <button
                      type="button"
                      onClick={() => void makeDefault(vehicle.id)}
                      className="ps-btn ps-btn-ghost !text-xs"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(vehicle.id)}
                    className="ps-btn ps-btn-ghost !text-xs text-[var(--text-muted)]"
                  >
                    Remove
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {!adding && vehicles.length > 0 && (
        <button type="button" onClick={() => setAdding(true)} className="ps-btn ps-btn-secondary">
          Add another vehicle
        </button>
      )}

      {adding && (
        <Card className="p-5">
          <h2 className="font-semibold">Add a vehicle</h2>

          <div className="mt-4">
            <label htmlFor="v-reg" className="ps-label">
              Registration number
            </label>
            <input
              id="v-reg"
              type="text"
              className="ps-input font-mono uppercase"
              placeholder="WB02AB1234"
              value={form.registration_number}
              onChange={(event) =>
                setForm((c) => ({ ...c, registration_number: event.target.value.toUpperCase() }))
              }
            />
            <p className="ps-hint">Spaces and dashes are fine, we tidy them up.</p>
          </div>

          <div className="mt-4">
            <p className="ps-label">Roughly what is it</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    form.vehicle_type === preset.type && form.height_m === String(preset.height)
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                      : 'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="ps-hint">
              This fills in typical dimensions. Adjust them below if you know your own.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="v-make" className="ps-label">
                Make
              </label>
              <input
                id="v-make"
                type="text"
                className="ps-input"
                placeholder="Hyundai"
                value={form.make}
                onChange={(event) => setForm((c) => ({ ...c, make: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="v-model" className="ps-label">
                Model
              </label>
              <input
                id="v-model"
                type="text"
                className="ps-input"
                placeholder="Creta"
                value={form.model}
                onChange={(event) => setForm((c) => ({ ...c, model: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="v-colour" className="ps-label">
                Colour
              </label>
              <input
                id="v-colour"
                type="text"
                className="ps-input"
                placeholder="White"
                value={form.colour}
                onChange={(event) => setForm((c) => ({ ...c, colour: event.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="v-length" className="ps-label">
                Length in metres
              </label>
              <input
                id="v-length"
                type="number"
                step="0.05"
                min="0.5"
                max="20"
                className="ps-input"
                value={form.length_m}
                onChange={(event) => setForm((c) => ({ ...c, length_m: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="v-width" className="ps-label">
                Width in metres
              </label>
              <input
                id="v-width"
                type="number"
                step="0.05"
                min="0.3"
                max="5"
                className="ps-input"
                value={form.width_m}
                onChange={(event) => setForm((c) => ({ ...c, width_m: event.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="v-height" className="ps-label">
                Height in metres
              </label>
              <input
                id="v-height"
                type="number"
                step="0.05"
                min="0.5"
                max="5"
                className="ps-input"
                value={form.height_m}
                onChange={(event) => setForm((c) => ({ ...c, height_m: event.target.value }))}
              />
              <p className="ps-hint">The one that matters for basements.</p>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={form.is_electric}
              onChange={(event) => setForm((c) => ({ ...c, is_electric: event.target.checked }))}
            />
            This is an electric vehicle
          </label>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="ps-btn ps-btn-primary"
            >
              {busy ? 'Saving...' : 'Save vehicle'}
            </button>
            {vehicles.length > 0 && (
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="ps-btn ps-btn-secondary"
              >
                Cancel
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
