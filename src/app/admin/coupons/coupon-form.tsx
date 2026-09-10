'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import type { FieldErrors } from '@/lib/validation';

/**
 * Create a coupon.
 *
 * The form takes the number a human thinks in, a percentage or an amount in
 * rupees, and converts it to the unit the column actually holds: basis points
 * for a percent coupon, paise for a flat one. That conversion happens once,
 * here, and the preview underneath states in words what will be stored, because
 * a coupon that turns out to be a hundred times too generous is discovered by
 * the finance report rather than by anyone reading a form.
 */
export function CouponForm() {
  const router = useRouter();
  const [type, setType] = useState<'flat' | 'percent'>('percent');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('10');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minBooking, setMinBooking] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [maxPerUser, setMaxPerUser] = useState('1');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [newUsersOnly, setNewUsersOnly] = useState(false);
  const [firstBookingOnly, setFirstBookingOnly] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;

  const storedValue = amountValid
    ? type === 'percent'
      ? Math.round(amountNumber * 100)
      : rupeesToPaise(amountNumber)
    : null;

  const preview =
    storedValue == null
      ? 'Enter a value to see what will be stored.'
      : type === 'percent'
        ? `${amountNumber}% off, stored as ${storedValue} basis points.`
        : `${formatPaise(storedValue)} off, stored as ${storedValue} paise.`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setCreated(null);

    if (!amountValid) {
      setErrors({ value: 'Enter a value greater than zero' });
      return;
    }
    if (type === 'percent' && amountNumber > 100) {
      setErrors({ value: 'A percentage cannot exceed 100' });
      return;
    }

    const minBookingNumber = Number(minBooking);
    const maxDiscountNumber = Number(maxDiscount);

    setBusy(true);
    try {
      const response = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          description: description.trim(),
          coupon_type: type,
          value: storedValue,
          max_discount_paise:
            maxDiscount.trim() !== '' && Number.isFinite(maxDiscountNumber) && maxDiscountNumber > 0
              ? rupeesToPaise(maxDiscountNumber)
              : undefined,
          min_booking_paise:
            minBooking.trim() !== '' && Number.isFinite(minBookingNumber) && minBookingNumber > 0
              ? rupeesToPaise(minBookingNumber)
              : 0,
          max_redemptions: maxRedemptions.trim() !== '' ? Number(maxRedemptions) : undefined,
          max_per_user: Number(maxPerUser) || 1,
          new_users_only: newUsersOnly,
          first_booking_only: firstBookingOnly,
          valid_from: validFrom || undefined,
          valid_until: validUntil || undefined,
          is_active: true,
        }),
      });

      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
        fields?: FieldErrors;
        coupon?: { code: string };
      };

      if (!response.ok || !body.ok) {
        if (body.fields) setErrors(body.fields);
        setFormError(body.message ?? 'That coupon was not created.');
        return;
      }

      setCreated(body.coupon?.code ?? code.trim().toUpperCase());
      setCode('');
      setDescription('');
      router.refresh();
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="ps-label" htmlFor="code">
            Code
          </label>
          <input
            id="code"
            className="ps-input font-mono uppercase"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-invalid={errors.code ? 'true' : undefined}
            placeholder="WELCOME10"
            maxLength={40}
          />
          {errors.code ? (
            <p className="ps-error">{errors.code}</p>
          ) : (
            <p className="ps-hint">Stored in uppercase. Letters, numbers, hyphens, underscores.</p>
          )}
        </div>

        <div>
          <label className="ps-label" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            className="ps-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            placeholder="Launch offer, Park Street"
          />
        </div>
      </div>

      <fieldset>
        <legend className="ps-label">Discount type</legend>
        <div className="flex flex-wrap gap-2">
          {(['percent', 'flat'] as const).map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                type === option
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                  : 'border-[var(--border)]'
              }`}
            >
              <input
                type="radio"
                name="coupon_type"
                className="size-4"
                checked={type === option}
                onChange={() => setType(option)}
              />
              {option === 'percent' ? 'Percentage off' : 'Flat amount off'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="ps-label" htmlFor="value">
            {type === 'percent' ? 'Percentage off' : 'Amount off (rupees)'}
          </label>
          <input
            id="value"
            className="ps-input"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={errors.value ? 'true' : undefined}
            inputMode="decimal"
          />
          {errors.value ? <p className="ps-error">{errors.value}</p> : <p className="ps-hint">{preview}</p>}
        </div>

        {type === 'percent' && (
          <div>
            <label className="ps-label" htmlFor="max_discount">
              Cap the discount at (rupees)
            </label>
            <input
              id="max_discount"
              className="ps-input"
              value={maxDiscount}
              onChange={(event) => setMaxDiscount(event.target.value)}
              inputMode="decimal"
              placeholder="Optional"
            />
            <p className="ps-hint">
              Without a cap, a percentage coupon on a monthly booking costs far more than intended.
            </p>
          </div>
        )}

        <div>
          <label className="ps-label" htmlFor="min_booking">
            Minimum booking (rupees)
          </label>
          <input
            id="min_booking"
            className="ps-input"
            value={minBooking}
            onChange={(event) => setMinBooking(event.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </div>

        <div>
          <label className="ps-label" htmlFor="max_redemptions">
            Total redemptions allowed
          </label>
          <input
            id="max_redemptions"
            className="ps-input"
            value={maxRedemptions}
            onChange={(event) => setMaxRedemptions(event.target.value)}
            inputMode="numeric"
            placeholder="Unlimited"
          />
        </div>

        <div>
          <label className="ps-label" htmlFor="max_per_user">
            Redemptions per user
          </label>
          <input
            id="max_per_user"
            className="ps-input"
            value={maxPerUser}
            onChange={(event) => setMaxPerUser(event.target.value)}
            inputMode="numeric"
          />
        </div>

        <div>
          <label className="ps-label" htmlFor="valid_from">
            Valid from
          </label>
          <input
            id="valid_from"
            type="datetime-local"
            className="ps-input"
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
          />
        </div>

        <div>
          <label className="ps-label" htmlFor="valid_until">
            Valid until
          </label>
          <input
            id="valid_until"
            type="datetime-local"
            className="ps-input"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            aria-invalid={errors.valid_until ? 'true' : undefined}
          />
          {errors.valid_until ? (
            <p className="ps-error">{errors.valid_until}</p>
          ) : (
            <p className="ps-hint">Leave blank for no expiry.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={newUsersOnly}
            onChange={(event) => setNewUsersOnly(event.target.checked)}
          />
          New accounts only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={firstBookingOnly}
            onChange={(event) => setFirstBookingOnly(event.target.checked)}
          />
          First booking only
        </label>
      </div>

      {formError && (
        <Alert tone="danger" title="That did not work">
          <p className="mt-1">{formError}</p>
        </Alert>
      )}

      {created && (
        <Alert tone="success" title="Coupon created">
          <p className="mt-1">
            <span className="font-mono font-bold">{created}</span> is live and will validate at
            checkout.
          </p>
        </Alert>
      )}

      <button type="submit" className="ps-btn ps-btn-primary" disabled={busy}>
        {busy ? 'Creating...' : 'Create coupon'}
      </button>
    </form>
  );
}
