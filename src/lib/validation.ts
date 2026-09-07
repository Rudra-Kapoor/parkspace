import { z } from 'zod';

/**
 * Validation at every trust boundary.
 *
 * Anything arriving from a browser, a webhook or a URL is parsed here before it
 * reaches business logic. These schemas are the only place that decides what a
 * well-formed request looks like, so the rules cannot drift between the client
 * form and the server route: both import the same schema.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid('That does not look like a valid identifier');

export const latSchema = z.coerce.number().min(-90).max(90);
export const lngSchema = z.coerce.number().min(-180).max(180);

/**
 * Indian vehicle registration.
 *
 * Deliberately permissive. The formats in circulation include the standard
 * state series, the older three-letter series, Bharat series plates and military
 * registrations, and a driver being told their own numberplate is invalid is a
 * far worse outcome than storing an odd one. Normalisation to uppercase without
 * separators happens in the database trigger.
 */
export const registrationSchema = z
  .string()
  .trim()
  .min(4, 'That registration looks too short')
  .max(15, 'That registration looks too long')
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((value) => /^[A-Z0-9]{4,15}$/.test(value), 'Use letters and numbers only');

export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[^\d+]/g, ''))
  .refine(
    (value) => /^\+?[0-9]{10,15}$/.test(value),
    'Enter a valid phone number, including the country code if it is not Indian',
  );

/** ISO timestamp that must parse to a real instant. */
export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Not a valid date and time'));

// ---------------------------------------------------------------------------
// Enums, mirroring the database
// ---------------------------------------------------------------------------

export const vehicleTypeSchema = z.enum([
  'two_wheeler',
  'hatchback',
  'sedan',
  'suv',
  'electric',
  'commercial',
]);

export const spaceTypeSchema = z.enum([
  'driveway',
  'garage',
  'covered_lot',
  'open_lot',
  'basement',
  'stack_parking',
  'street_side',
  'multi_level',
]);

export const cancellationPolicySchema = z.enum(['flexible', 'moderate', 'strict', 'non_refundable']);

export const accessMethodSchema = z.enum([
  'open_access',
  'host_greets',
  'qr_code',
  'pin_code',
  'remote_gate',
  'smart_lock',
  'plate_recognition',
]);

export const disputeCategorySchema = z.enum([
  'space_unavailable',
  'access_failure',
  'wrong_location',
  'space_too_small',
  'vehicle_blocked',
  'unsafe_location',
  'overcharged',
  'vehicle_damage',
  'property_damage',
  'host_no_show',
  'driver_no_show',
  'other',
]);

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export const vehicleInputSchema = z.object({
  registration_number: registrationSchema,
  vehicle_type: vehicleTypeSchema,
  make: z.string().trim().max(40).optional().or(z.literal('')),
  model: z.string().trim().max(40).optional().or(z.literal('')),
  colour: z.string().trim().max(30).optional().or(z.literal('')),
  length_mm: z.coerce.number().int().min(500).max(20_000).optional(),
  width_mm: z.coerce.number().int().min(300).max(5_000).optional(),
  height_mm: z.coerce.number().int().min(500).max(5_000).optional(),
  is_electric: z.coerce.boolean().default(false),
  is_default: z.coerce.boolean().default(false),
});

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchParamsSchema = z
  .object({
    lat: latSchema,
    lng: lngSchema,
    radius_m: z.coerce.number().int().min(100).max(10_000).default(1500),
    starts_at: isoDateTimeSchema.optional(),
    ends_at: isoDateTimeSchema.optional(),
    vehicle_type: vehicleTypeSchema.optional(),
    max_price_paise: z.coerce.number().int().min(0).optional(),
    space_types: z.array(spaceTypeSchema).optional(),
    amenities: z.array(z.string().max(40)).max(15).optional(),
    min_rating: z.coerce.number().min(0).max(5).optional(),
    instant_only: z.coerce.boolean().default(false),
    ev_only: z.coerce.boolean().default(false),
    sort: z.enum(['relevance', 'distance', 'price_asc', 'price_desc', 'rating']).default('relevance'),
    limit: z.coerce.number().int().min(1).max(200).default(60),
    offset: z.coerce.number().int().min(0).default(0),
    q: z.string().trim().max(120).optional(),
  })
  .refine(
    (v) => !v.starts_at || !v.ends_at || new Date(v.ends_at) > new Date(v.starts_at),
    { message: 'The end time must be after the start time', path: ['ends_at'] },
  );

export type SearchParams = z.infer<typeof searchParamsSchema>;

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const listingDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(8, 'Give your space a name of at least 8 characters')
    .max(120, 'Keep the name under 120 characters'),
  description: z
    .string()
    .trim()
    .min(40, 'Describe the space in at least 40 characters, so drivers know what to expect')
    .max(4000)
    .optional(),
  address_line: z.string().trim().min(5, 'Enter the street address').max(300),
  landmark: z.string().trim().max(200).optional().or(z.literal('')),
  locality: z.string().trim().min(2, 'Enter the locality').max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  postal_code: z.string().trim().max(12).optional().or(z.literal('')),
  lat: latSchema,
  lng: lngSchema,
  space_type: spaceTypeSchema,
  vehicle_types: z.array(vehicleTypeSchema).min(1, 'Choose at least one vehicle type'),
  capacity: z.coerce.number().int().min(1).max(500).default(1),
  max_length_mm: z.coerce.number().int().min(1000).max(30_000).optional(),
  max_width_mm: z.coerce.number().int().min(1000).max(10_000).optional(),
  max_height_mm: z.coerce.number().int().min(1000).max(10_000).optional(),
  amenities: z.array(z.string().max(40)).max(20).default([]),
  rules: z.array(z.string().max(200)).max(20).default([]),
  price_hourly_paise: z.coerce.number().int().min(0).max(10_000_000).optional(),
  price_daily_paise: z.coerce.number().int().min(0).max(100_000_000).optional(),
  price_monthly_paise: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  min_booking_minutes: z.coerce.number().int().min(15).max(43_200).default(30),
  max_booking_minutes: z.coerce.number().int().min(15).optional(),
  min_notice_minutes: z.coerce.number().int().min(0).max(10_080).default(0),
  max_advance_days: z.coerce.number().int().min(1).max(365).default(90),
  instant_book: z.coerce.boolean().default(true),
  cancellation_policy: cancellationPolicySchema.default('moderate'),
  access_method: accessMethodSchema.default('open_access'),
  access_instructions: z.string().trim().max(2000).optional().or(z.literal('')),
  access_pin: z.string().trim().max(30).optional().or(z.literal('')),
  has_ev_charging: z.coerce.boolean().default(false),
  ev_connector_type: z.string().trim().max(40).optional().or(z.literal('')),
  ev_power_kw: z.coerce.number().min(0).max(400).optional(),
  ev_price_per_kwh_paise: z.coerce.number().int().min(0).optional(),
});

/**
 * The extra conditions a listing must satisfy before it can be submitted for
 * review. Kept separate from the draft schema so a half-finished listing can
 * still be saved, which matters because the wizard is long and people abandon
 * forms that refuse to save.
 */
export const listingSubmitSchema = listingDraftSchema
  .refine(
    (v) =>
      v.price_hourly_paise != null || v.price_daily_paise != null || v.price_monthly_paise != null,
    { message: 'Set at least one price, hourly, daily or monthly', path: ['price_hourly_paise'] },
  )
  .refine((v) => v.description != null && v.description.length >= 40, {
    message: 'A description of at least 40 characters is required before going live',
    path: ['description'],
  })
  .refine(
    (v) =>
      !['garage', 'basement', 'covered_lot', 'stack_parking'].includes(v.space_type) ||
      v.max_height_mm != null,
    {
      // The single most common cause of a driver arriving and being unable to
      // park is an unstated height limit on a covered space.
      message: 'Covered and basement spaces must state a height limit',
      path: ['max_height_mm'],
    },
  )
  .refine(
    (v) => !v.max_booking_minutes || v.max_booking_minutes >= v.min_booking_minutes,
    { message: 'The maximum stay cannot be shorter than the minimum', path: ['max_booking_minutes'] },
  )
  .refine((v) => !v.has_ev_charging || Boolean(v.ev_connector_type), {
    message: 'Say which connector type you offer',
    path: ['ev_connector_type'],
  });

export type ListingDraft = z.infer<typeof listingDraftSchema>;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const availabilityRuleSchema = z
  .object({
    day_of_week: z.coerce.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM'),
    end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM'),
    ends_next_day: z.coerce.boolean().default(false),
  })
  .refine((v) => v.ends_next_day || v.end_time > v.start_time, {
    message: 'The end time must be after the start time, unless the window runs past midnight',
    path: ['end_time'],
  });

export const availabilityBlockSchema = z
  .object({
    starts_at: isoDateTimeSchema,
    ends_at: isoDateTimeSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: 'The end must be after the start',
    path: ['ends_at'],
  });

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const quoteRequestSchema = z
  .object({
    space_id: uuidSchema,
    starts_at: isoDateTimeSchema,
    ends_at: isoDateTimeSchema,
    coupon_code: z.string().trim().max(40).optional().or(z.literal('')),
    use_wallet: z.coerce.boolean().default(false),
  })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), {
    message: 'The end time must be after the start time',
    path: ['ends_at'],
  });

export const bookingRequestSchema = quoteRequestSchema.and(
  z.object({
    vehicle_id: uuidSchema.optional(),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
    /**
     * Client-generated, stable across retries of the same user intent. This is
     * what makes a double-clicked Pay button produce one booking instead of two.
     */
    idempotency_key: z.string().min(8).max(100),
  }),
);

export const cancelRequestSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

export const checkInSchema = z.object({
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
});

export const extendRequestSchema = z.object({
  new_ends_at: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Reviews, messages, disputes
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  booking_id: uuidSchema,
  rating: z.coerce.number().int().min(1).max(5),
  rating_accuracy: z.coerce.number().int().min(1).max(5).optional(),
  rating_safety: z.coerce.number().int().min(1).max(5).optional(),
  rating_cleanliness: z.coerce.number().int().min(1).max(5).optional(),
  rating_accessibility: z.coerce.number().int().min(1).max(5).optional(),
  rating_value: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const messageSchema = z.object({
  booking_id: uuidSchema,
  body: z.string().trim().min(1, 'Write something').max(4000),
});

export const disputeSchema = z.object({
  booking_id: uuidSchema,
  category: disputeCategorySchema,
  description: z
    .string()
    .trim()
    .min(10, 'Tell us what happened, in at least 10 characters')
    .max(4000),
  evidence_paths: z.array(z.string().max(300)).max(10).default([]),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(100),
  phone: phoneSchema.optional().or(z.literal('')),
  avatar_url: z.string().url().optional().or(z.literal('')),
  preferred_locale: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
});

export const hostProfileSchema = z.object({
  display_name: z.string().trim().min(2, 'Enter a display name').max(100),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
  is_business: z.coerce.boolean().default(false),
  business_name: z.string().trim().max(200).optional().or(z.literal('')),
  business_type: z.string().trim().max(100).optional().or(z.literal('')),
}).refine((v) => !v.is_business || Boolean(v.business_name), {
  message: 'Enter the business name',
  path: ['business_name'],
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export interface FieldErrors {
  [field: string]: string;
}

/** Flatten a Zod error into something a form can render field by field. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
