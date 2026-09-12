/**
 * Domain types.
 *
 * Hand-written rather than generated, because the generated Supabase types
 * describe table shapes and this file describes the domain. The two differ in
 * one important way: several of these types reflect what the *view* exposes, not
 * what the table holds, and that distinction is the location privacy rule.
 */

export type UserRole = 'driver' | 'host' | 'operator' | 'admin' | 'support';

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'suspended';

export type SpaceType =
  | 'driveway'
  | 'garage'
  | 'covered_lot'
  | 'open_lot'
  | 'basement'
  | 'stack_parking'
  | 'street_side'
  | 'multi_level';

export type VehicleType =
  | 'two_wheeler'
  | 'hatchback'
  | 'sedan'
  | 'suv'
  | 'electric'
  | 'commercial';

export type ListingStatus =
  | 'draft'
  | 'pending_review'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'delisted';

export type BookingStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'no_show'
  | 'disputed';

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict' | 'non_refundable';

export type CancelledByParty = 'driver' | 'host' | 'platform' | 'system';

export type PaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type RefundStatus = 'requested' | 'processing' | 'completed' | 'rejected' | 'failed';

export type PayoutStatus = 'scheduled' | 'processing' | 'paid' | 'failed' | 'on_hold';

export type ReviewDirection = 'driver_to_host' | 'host_to_driver';

export type DisputeCategory =
  | 'space_unavailable'
  | 'access_failure'
  | 'wrong_location'
  | 'space_too_small'
  | 'vehicle_blocked'
  | 'unsafe_location'
  | 'overcharged'
  | 'vehicle_damage'
  | 'property_damage'
  | 'host_no_show'
  | 'driver_no_show'
  | 'other';

export type DisputeStatus =
  | 'open'
  | 'investigating'
  | 'awaiting_user'
  | 'resolved_driver'
  | 'resolved_host'
  | 'resolved_split'
  | 'rejected'
  | 'withdrawn';

export type AccessMethod =
  | 'open_access'
  | 'host_greets'
  | 'qr_code'
  | 'pin_code'
  | 'remote_gate'
  | 'smart_lock'
  | 'plate_recognition';

export type WalletTxnType =
  | 'refund_credit'
  | 'referral_credit'
  | 'promo_credit'
  | 'compensation'
  | 'booking_spend'
  | 'withdrawal'
  | 'adjustment';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: UserRole;
  roles: UserRole[];
  verification: VerificationStatus;
  trust_score: number;
  bookings_completed: number;
  bookings_cancelled: number;
  wallet_balance_paise: number;
  referral_code: string | null;
  preferred_locale: string;
  timezone: string;
  notification_prefs: Record<string, boolean>;
  is_suspended: boolean;
  created_at: string;
}

/** The safe projection of someone else's profile. */
export interface PublicProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  trust_score: number;
  bookings_completed: number;
  member_since: string;
  is_verified: boolean;
  is_superhost: boolean | null;
  host_display_name: string | null;
  response_rate_bp: number | null;
  avg_response_minutes: number | null;
}

export interface Vehicle {
  id: string;
  owner_id: string;
  registration_number: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  colour: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  is_electric: boolean;
  is_default: boolean;
  created_at: string;
}

export interface HostProfile {
  user_id: string;
  display_name: string;
  bio: string | null;
  is_business: boolean;
  business_name: string | null;
  kyc_status: VerificationStatus;
  payout_ref: string | null;
  response_rate_bp: number;
  acceptance_rate_bp: number;
  cancellation_count_90d: number;
  avg_response_minutes: number | null;
  is_superhost: boolean;
  superhost_since: string | null;
  total_earnings_paise: number;
  payable_balance_paise: number;
  created_at: string;
}

/**
 * A space as the public view exposes it.
 *
 * Note what is nullable and why. `address_line`, `exact_lat`, `exact_lng`,
 * `access_instructions` and `access_pin` are null for everyone except the host,
 * an admin, and a driver holding a confirmed booking within 24 hours of the
 * stay. The database decides that, not the caller, and the nullability here is
 * the type system carrying that fact forward so a component cannot forget it.
 */
export interface PublicSpace {
  id: string;
  slug: string | null;
  host_id: string;
  title: string;
  description: string | null;
  locality: string;
  city: string;
  state: string;
  postal_code: string | null;
  country: string;
  approx_lat: number;
  approx_lng: number;
  space_type: SpaceType;
  vehicle_types: VehicleType[];
  capacity: number;
  max_length_mm: number | null;
  max_width_mm: number | null;
  max_height_mm: number | null;
  amenities: string[];
  rules: string[];
  price_hourly_paise: number | null;
  price_daily_paise: number | null;
  price_monthly_paise: number | null;
  currency: string;
  min_booking_minutes: number;
  max_booking_minutes: number | null;
  min_notice_minutes: number;
  max_advance_days: number;
  instant_book: boolean;
  cancellation_policy: CancellationPolicy;
  access_method: AccessMethod;
  has_ev_charging: boolean;
  ev_connector_type: string | null;
  ev_power_kw: number | null;
  ev_price_per_kwh_paise: number | null;
  avg_rating: number | null;
  review_count: number;
  booking_count: number;
  published_at: string | null;

  // Released conditionally. Null means you are not entitled to it, not that it
  // is missing.
  address_line: string | null;
  landmark: string | null;
  exact_lat: number | null;
  exact_lng: number | null;
  access_instructions: string | null;
  access_pin: string | null;
}

/** One row from the search_spaces() function. */
export interface SearchResult {
  id: string;
  title: string;
  slug: string | null;
  locality: string;
  city: string;
  approx_lat: number;
  approx_lng: number;
  distance_m: number;
  space_type: SpaceType;
  vehicle_types: VehicleType[];
  amenities: string[];
  capacity: number;
  free_bays: number;
  price_hourly_paise: number | null;
  price_daily_paise: number | null;
  price_monthly_paise: number | null;
  quoted_base_paise: number | null;
  avg_rating: number | null;
  review_count: number;
  instant_book: boolean;
  has_ev_charging: boolean;
  max_height_mm: number | null;
  cancellation_policy: CancellationPolicy;
  is_superhost: boolean;
  primary_photo: string | null;
  relevance_score: number;
  total_count: number;
}

export interface Booking {
  id: string;
  code: string;
  space_id: string;
  driver_id: string;
  host_id: string;
  vehicle_id: string | null;
  bay_index: number;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  hold_expires_at: string | null;
  base_amount_paise: number;
  discount_amount_paise: number;
  wallet_applied_paise: number;
  service_fee_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
  host_commission_paise: number;
  host_payout_paise: number;
  currency: string;
  commission_rate_bp: number;
  service_fee_rate_bp: number;
  tax_rate_bp: number;
  coupon_code: string | null;
  cancellation_policy: CancellationPolicy;
  qr_token: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  checkin_distance_m: number | null;
  overstay_minutes: number;
  overstay_amount_paise: number;
  extension_count: number;
  cancelled_at: string | null;
  cancelled_by: CancelledByParty | null;
  cancellation_reason: string | null;
  refund_amount_paise: number;
  space_snapshot: Record<string, unknown> | null;
  driver_notes: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  space_id: string | null;
  author_id: string;
  subject_id: string;
  direction: ReviewDirection;
  rating: number;
  rating_accuracy: number | null;
  rating_safety: number | null;
  rating_cleanliness: number | null;
  rating_accessibility: number | null;
  rating_value: number | null;
  comment: string | null;
  is_published: boolean;
  host_response: string | null;
  host_responded_at: string | null;
  created_at: string;
}

export interface BookingMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  is_system: boolean;
  redacted: boolean;
  read_at: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  channel: string;
  template_key: string;
  title: string;
  body: string;
  action_url: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface Dispute {
  id: string;
  booking_id: string;
  raised_by: string;
  against_id: string | null;
  category: DisputeCategory;
  description: string;
  evidence_paths: string[];
  status: DisputeStatus;
  priority: number;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  txn_type: WalletTxnType;
  amount_paise: number;
  balance_after_paise: number;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
}

/** The JSON returned by quote_booking(). */
export interface Quote {
  ok: boolean;
  error?: string;
  available: boolean;
  free_bays: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  base_amount_paise: number;
  discount_amount_paise: number;
  wallet_applied_paise: number;
  taxable_amount_paise: number;
  service_fee_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
  host_commission_paise: number;
  host_payout_paise: number;
  commission_rate_bp: number;
  service_fee_rate_bp: number;
  tax_rate_bp: number;
  coupon_code: string | null;
  coupon_id: string | null;
  coupon_error: string | null;
  cancellation_policy: CancellationPolicy;
}

export interface RefundCalculation {
  ok: boolean;
  refund_paise: number;
  wallet_return_paise: number;
  forfeited_paise: number;
  platform_keeps_paise: number;
  host_keeps_paise: number;
  service_fee_retained_paise: number;
  policy: CancellationPolicy;
  cutoff_hours: number | null;
  hours_before_start: number;
  reason: string;
}

export interface SeoLocality {
  slug: string;
  city_slug: string;
  city: string;
  locality: string;
  state: string;
  lat: number;
  lng: number;
  blurb: string | null;
  landmarks: string[];
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Display metadata
// ---------------------------------------------------------------------------

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  driveway: 'Driveway',
  garage: 'Garage',
  covered_lot: 'Covered lot',
  open_lot: 'Open lot',
  basement: 'Basement',
  stack_parking: 'Stack parking',
  street_side: 'Street side',
  multi_level: 'Multi level',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  two_wheeler: 'Two wheeler',
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
  electric: 'Electric',
  commercial: 'Commercial',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  draft: 'Draft',
  pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  active: 'Parked',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  no_show: 'Not arrived',
  disputed: 'Under review',
};

export const CANCELLATION_POLICY_LABELS: Record<CancellationPolicy, string> = {
  flexible: 'Flexible',
  moderate: 'Moderate',
  strict: 'Strict',
  non_refundable: 'Non refundable',
};

/** Plain-language policy copy, shown on the listing page and at checkout. */
export const CANCELLATION_POLICY_COPY: Record<CancellationPolicy, string> = {
  flexible: 'Free cancellation until 1 hour before your booking starts. Nothing after that.',
  moderate: 'Free cancellation until 24 hours before. Half back after that.',
  strict: 'Half back until 48 hours before. Nothing after that.',
  non_refundable: 'This booking cannot be refunded once confirmed.',
};

export const AMENITY_LABELS: Record<string, string> = {
  cctv: 'CCTV',
  security_guard: 'Security guard',
  gated: 'Gated',
  covered: 'Covered',
  lit: 'Well lit',
  ev_charging: 'EV charging',
  wash: 'Car wash',
  valet: 'Valet',
  restroom: 'Restroom',
  wheelchair_accessible: 'Step free access',
  lift: 'Lift access',
  wide_bay: 'Extra wide bay',
  power_backup: 'Power backup',
  attendant: 'Attendant on site',
};
