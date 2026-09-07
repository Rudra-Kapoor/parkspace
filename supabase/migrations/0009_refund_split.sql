-- =============================================================================
-- ParkSpace 0009 — settle the forfeit split
-- =============================================================================
-- Drafting the legal documents surfaced a gap the first cut of
-- compute_refund_paise left open: when a driver cancels late and forfeits part
-- of what they paid, who keeps the forfeited money.
--
-- The answer recorded in spec kernel section 8 is that the forfeit is split on
-- the same terms as a delivered booking. The platform takes its commission
-- percentage of the forfeited amount and the host keeps the rest. The platform
-- does not take a full commission on a stay that never happened, and the host is
-- not paid gross on one either.
--
-- This migration adds the split to the return value so that the refunds table,
-- the host earnings line and the driver's receipt all agree about where the
-- money went.
-- =============================================================================

create or replace function compute_refund_paise(
  p_booking_id uuid,
  p_by         cancelled_by_party
)
returns jsonb
language plpgsql
stable
as $$
declare
  b bookings%rowtype;
  hours_before numeric;
  net_paid bigint;          -- what the driver paid for the parking itself
  refund bigint;
  forfeited bigint;
  platform_keeps bigint;
  host_keeps bigint;
  wallet_return bigint;
  cutoff_hours numeric;
  reason text;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  hours_before := extract(epoch from (b.starts_at - now())) / 3600.0;

  -- The parking component, excluding the service fee and the tax on that fee.
  net_paid := b.base_amount_paise - b.discount_amount_paise;

  -- ---------------------------------------------------------------------------
  -- Host or platform cancellation: the driver is made whole, fee included, and
  -- nobody keeps anything.
  -- ---------------------------------------------------------------------------
  if p_by in ('host', 'platform') then
    return jsonb_build_object(
      'ok', true,
      'refund_paise', b.total_amount_paise - b.wallet_applied_paise,
      'wallet_return_paise', b.wallet_applied_paise,
      'forfeited_paise', 0,
      'platform_keeps_paise', 0,
      'host_keeps_paise', 0,
      'service_fee_retained_paise', 0,
      'policy', b.cancellation_policy,
      'hours_before_start', round(hours_before, 2),
      'reason', 'full_refund_host_or_platform'
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Already parked: nothing is refundable.
  -- ---------------------------------------------------------------------------
  if b.status = 'active' or b.checked_in_at is not null then
    forfeited := net_paid;
    platform_keeps := round(forfeited * b.commission_rate_bp / 10000.0);
    host_keeps := forfeited - platform_keeps;

    return jsonb_build_object(
      'ok', true,
      'refund_paise', 0,
      'wallet_return_paise', 0,
      'forfeited_paise', forfeited,
      'platform_keeps_paise', platform_keeps + b.service_fee_paise,
      'host_keeps_paise', host_keeps,
      'service_fee_retained_paise', b.service_fee_paise,
      'policy', b.cancellation_policy,
      'hours_before_start', round(hours_before, 2),
      'reason', 'already_checked_in'
    );
  end if;

  -- ---------------------------------------------------------------------------
  -- Policy table. See spec kernel section 8.
  -- ---------------------------------------------------------------------------
  cutoff_hours := case b.cancellation_policy
    when 'flexible' then 1
    when 'moderate' then 24
    when 'strict'   then 48
    else null
  end;

  refund := case b.cancellation_policy
    when 'flexible' then
      case when hours_before >= 1 then net_paid else 0 end
    when 'moderate' then
      case when hours_before >= 24 then net_paid else net_paid / 2 end
    when 'strict' then
      case when hours_before >= 48 then net_paid / 2 else 0 end
    when 'non_refundable' then 0
  end;

  reason := case
    when b.cancellation_policy = 'non_refundable' then 'non_refundable_policy'
    when cutoff_hours is not null and hours_before >= cutoff_hours then 'before_cutoff'
    else 'after_cutoff'
  end;

  forfeited := net_paid - refund;
  platform_keeps := round(forfeited * b.commission_rate_bp / 10000.0);
  host_keeps := forfeited - platform_keeps;

  -- The wallet portion never touched a payment instrument, so it returns to the
  -- wallet rather than to a card. It is refunded in the same proportion as the
  -- cash, which keeps the two consistent when a driver paid part in credit.
  wallet_return := case
    when net_paid = 0 then 0
    else least(b.wallet_applied_paise, round(b.wallet_applied_paise * refund::numeric / net_paid))
  end;

  -- The cash refund is what remains after the wallet share is accounted for.
  refund := greatest(refund - wallet_return, 0);

  return jsonb_build_object(
    'ok', true,
    'refund_paise', refund,
    'wallet_return_paise', wallet_return,
    'forfeited_paise', forfeited,
    'platform_keeps_paise', platform_keeps + b.service_fee_paise,
    'host_keeps_paise', host_keeps,
    'service_fee_retained_paise', b.service_fee_paise,
    'policy', b.cancellation_policy,
    'cutoff_hours', cutoff_hours,
    'hours_before_start', round(hours_before, 2),
    'reason', reason
  );
end;
$$;

-- cancel_booking now records the split onto the refund row, so a month later the
-- finance report can say exactly what happened without recomputing policy against
-- rates that may since have changed.
create or replace function cancel_booking(
  p_booking_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  b bookings%rowtype;
  by cancelled_by_party;
  calc jsonb;
  v_refund bigint;
  v_wallet_return bigint;
  v_host_keeps bigint;
  v_platform_keeps bigint;
  is_admin_user boolean;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  end if;

  select exists (
    select 1 from profiles where id = v_user and role in ('admin','support')
  ) into is_admin_user;

  if v_user = b.driver_id then
    by := 'driver';
  elsif v_user = b.host_id then
    by := 'host';
  elsif is_admin_user then
    by := 'platform';
  else
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHORIZED');
  end if;

  if b.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', b.status);
  end if;

  calc := compute_refund_paise(p_booking_id, by);
  v_refund         := coalesce((calc->>'refund_paise')::bigint, 0);
  v_wallet_return  := coalesce((calc->>'wallet_return_paise')::bigint, 0);
  v_host_keeps     := coalesce((calc->>'host_keeps_paise')::bigint, 0);
  v_platform_keeps := coalesce((calc->>'platform_keeps_paise')::bigint, 0);

  update bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = by,
         cancellation_reason = p_reason,
         refund_amount_paise = v_refund,
         -- The host's entitlement collapses to whatever the forfeit split gave
         -- them. This is the number the payout run will actually pay.
         host_payout_paise = v_host_keeps,
         host_commission_paise = greatest(v_platform_keeps - service_fee_paise, 0),
         hold_expires_at = null
   where id = p_booking_id;

  if v_wallet_return > 0 then
    insert into wallet_transactions (user_id, txn_type, amount_paise, reference_type, reference_id, note)
    values (b.driver_id, 'refund_credit', v_wallet_return, 'booking', b.id,
            'Wallet returned for cancelled booking ' || b.code);
  end if;

  -- Credit the host their share of a forfeit right away. They held the bay and
  -- turned other drivers away for it, so they are owed for that.
  if v_host_keeps > 0 then
    update host_profiles
       set total_earnings_paise  = total_earnings_paise + v_host_keeps,
           payable_balance_paise = payable_balance_paise + v_host_keeps
     where user_id = b.host_id;
  end if;

  if v_refund > 0 then
    insert into refunds (
      payment_id, booking_id, amount_paise, policy_applied, reason,
      requested_by, status, host_retained_paise, platform_retained_paise
    )
    select p.id, b.id, v_refund, b.cancellation_policy,
           coalesce(p_reason, 'Booking cancelled by ' || by::text),
           v_user, 'requested', v_host_keeps, v_platform_keeps
      from payments p
     where p.booking_id = b.id and p.status = 'captured'
     order by p.created_at desc
     limit 1;
  end if;

  if b.coupon_id is not null then
    delete from coupon_redemptions where booking_id = b.id;
    update coupons set redemption_count = greatest(redemption_count - 1, 0) where id = b.coupon_id;
  end if;

  insert into booking_events (booking_id, event_type, actor_id, metadata)
  values (p_booking_id, 'cancelled', v_user,
          jsonb_build_object('by', by, 'refund_paise', v_refund, 'split', calc));

  return jsonb_build_object(
    'ok', true,
    'refund_paise', v_refund,
    'wallet_return_paise', v_wallet_return,
    'calc', calc
  );
end;
$$;

grant execute on function compute_refund_paise(uuid, cancelled_by_party) to authenticated;
grant execute on function cancel_booking(uuid, text) to authenticated;

comment on function compute_refund_paise is
  'Pure policy. Returns the full split: what the driver gets back, what returns to wallet, what the host keeps of any forfeit, and what the platform keeps.';
