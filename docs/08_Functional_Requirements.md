# ParkSpace — Functional Requirements

> Derived from `00_SPEC_KERNEL.md`. Where this document and the kernel disagree, the
> kernel wins. Document number 08.

## How to read this document

Every requirement is numbered, atomic and testable. The form is:

```
FR-<GROUP>-<NNN> | The system SHALL ... | Priority: MUST | Acceptance: GIVEN ... WHEN ... THEN ...
```

**Priority** is one of:

| Priority | Meaning |
| --- | --- |
| MUST | The MVP does not ship without it. Failure is a release blocker. |
| SHOULD | Strongly expected in the MVP. Droppable only through the cut-list in `25_MVP_Roadmap.md`. |
| COULD | Desirable. First to be cut. |

**Shared vocabulary**, all from the kernel:

- Roles: `driver`, `host`, `operator`, `admin`, `support`.
- Booking states: `draft`, `pending`, `confirmed`, `active`, `completed`, `cancelled`, `expired`, `no_show`, `disputed`.
- Money keys: `HOST_COMMISSION_PCT` 0.10, `DRIVER_SERVICE_FEE_PCT` 0.05, `GST_PCT` 0.18.
- Timing keys: `BOOKING_HOLD_MINUTES` 10, `GRACE_PERIOD_MINUTES` 10, `MIN_BOOKING_MINUTES` 30, `MAX_BOOKING_DAYS` 90.
- Cancellation policies: `flexible`, `moderate`, `strict`, `non_refundable`.
- All amounts are integer paise in a `bigint`. Currency is INR.

Groups, in order: AUTH, PROFILE, VEHICLE, HOSTONB, LISTING, PHOTO, AVAIL, SEARCH, MAP,
DETAIL, QUOTE, BOOKING, HOLD, PAYMENT, REFUND, ACCESS, CANCEL, REVIEW, MESSAGE, NOTIFY,
WALLET, COUPON, REFERRAL, HOSTDASH, EARNINGS, ADMIN, MODERATION, DISPUTE, AUDIT, SEO,
SUPPORT. Total: 174 requirements.

---

## AUTH: authentication and session

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-AUTH-001 | The system SHALL allow a visitor to create an account with an email address using either a one time passcode or a password, through Supabase Auth. | MUST | GIVEN a visitor on `/auth/sign-up` WHEN they submit a valid unused email address THEN an account is created in `auth.users`, a `profiles` row is created with `role = 'driver'` and `roles = ['driver']`, and a verification passcode is delivered to that address. |
| FR-AUTH-002 | The system SHALL reject sign up with an email address that already has an account, without revealing whether that address exists. | MUST | GIVEN an email address already registered WHEN a visitor submits it on sign up THEN the response is the same generic "check your email" message shown to a new address, and no second account is created. |
| FR-AUTH-003 | The system SHALL expire an email one time passcode after 10 minutes and after a single successful use. | MUST | GIVEN a passcode issued 11 minutes ago WHEN it is submitted THEN authentication fails with `OTP_EXPIRED` and no session is created. |
| FR-AUTH-004 | The system SHALL lock passcode verification for 15 minutes after 5 consecutive failed attempts for the same email address. | MUST | GIVEN 5 failed passcode submissions for one address WHEN a 6th is submitted within 15 minutes THEN the response is `TOO_MANY_ATTEMPTS` and the attempt is not evaluated even if the code is correct. |
| FR-AUTH-005 | The system SHALL hold the active role on `profiles.role` and the full grant set on `profiles.roles`, and SHALL allow a user holding both `driver` and `host` to switch the active role without signing out. | MUST | GIVEN a user with `roles = ['driver','host']` and `role = 'driver'` WHEN they switch to host THEN `profiles.role` becomes `host`, the session is unchanged, and host-only routes become reachable in the same browser tab. |
| FR-AUTH-006 | The system SHALL deny every authenticated route to an unauthenticated request and redirect to sign in preserving the intended destination. | MUST | GIVEN an unauthenticated request to `/account/bookings/abc` WHEN it is served THEN the user is redirected to `/auth/sign-in?next=/account/bookings/abc` and, after signing in, lands on the original path. |
| FR-AUTH-007 | The system SHALL enforce role authorisation at the database layer through Row Level Security, and not only in application routing. | MUST | GIVEN a `driver` session token WHEN it queries a host-only table directly through the Supabase client THEN zero rows are returned regardless of any application-side check. |
| FR-AUTH-008 | The system SHALL allow a signed in user to sign out of the current session and to revoke all other sessions. | SHOULD | GIVEN a user signed in on two devices WHEN they choose "sign out everywhere" THEN both refresh tokens are revoked and the second device receives an authentication error on its next request. |

---

## PROFILE: user profile and preferences

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-PROFILE-001 | The system SHALL let a user set a display name, avatar image, preferred language and notification channel preferences. | MUST | GIVEN a signed in user WHEN they save a display name and disable email notifications THEN `profiles` reflects both changes and no further email notification is dispatched to that user. |
| FR-PROFILE-002 | The system SHALL support phone number verification by one time passcode and SHALL mark `profiles.phone_verified_at` on success. | MUST | GIVEN an unverified phone number WHEN the correct passcode is submitted within its validity window THEN `phone_verified_at` is set and the trust badge appears on the user's public profile summary. |
| FR-PROFILE-003 | The system SHALL prevent a user from reading or writing another user's profile row. | MUST | GIVEN user A's session WHEN it attempts to update user B's `profiles` row THEN the write is rejected by Row Level Security and an audit entry records the attempt. |
| FR-PROFILE-004 | The system SHALL allow a user to request account deletion, and SHALL refuse deletion while any booking is in `pending`, `confirmed`, `active` or `disputed`. | SHOULD | GIVEN a user with one `confirmed` booking WHEN they request deletion THEN the request is refused with `ACTIVE_OBLIGATIONS` and the blocking booking identifiers are listed. |

---

## VEHICLE: driver vehicle garage

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-VEHICLE-001 | The system SHALL let a driver add one or more vehicles with registration number, make, model, colour and size class, and SHALL mark exactly one as default. | MUST | GIVEN a driver with no vehicles WHEN they add a first vehicle THEN it is stored and automatically flagged `is_default = true`. |
| FR-VEHICLE-002 | The system SHALL normalise and validate an Indian registration number to an accepted format before saving. | MUST | GIVEN the input `wb 02 ab 1234` WHEN it is saved THEN it is stored as `WB02AB1234`, and GIVEN the input `12345` WHEN it is saved THEN the request is rejected with `INVALID_REGISTRATION`. |
| FR-VEHICLE-003 | The system SHALL prevent a booking against a space whose accepted size classes do not include the selected vehicle's size class. | MUST | GIVEN a space accepting only `hatchback` and `sedan` WHEN a driver selects an `suv` vehicle at quote time THEN the quote is refused with `VEHICLE_NOT_PERMITTED` and the reason is displayed. |
| FR-VEHICLE-004 | The system SHALL prevent deletion of a vehicle that is attached to any booking in `pending`, `confirmed` or `active`, and SHALL allow soft removal otherwise. | MUST | GIVEN a vehicle attached to a `confirmed` booking WHEN the driver deletes it THEN the deletion is refused with `VEHICLE_IN_USE` and the booking reference is returned. |

---

## HOSTONB: host onboarding and verification

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-HOSTONB-001 | The system SHALL let a `driver` add the `host` role by completing host onboarding, without creating a second account. | MUST | GIVEN a signed in driver WHEN they complete host onboarding THEN `profiles.roles` contains both `driver` and `host` and the user identifier is unchanged. |
| FR-HOSTONB-002 | The system SHALL collect an identity document, an address proof, an ownership or authorisation proof, and bank payout details during host onboarding, each stored in a private Supabase Storage bucket. | MUST | GIVEN a host uploading an identity document WHEN the upload completes THEN the object is written to the verification bucket, is not readable by any anonymous request, and is readable only by that host, `admin` and `support`. |
| FR-HOSTONB-003 | The system SHALL model host verification as one of `unverified`, `pending`, `verified`, `rejected`, `suspended`. | MUST | GIVEN a host who has just submitted documents WHEN the submission completes THEN `verification_status` is `pending` and the host appears in the admin verification queue. |
| FR-HOSTONB-004 | The system SHALL prevent a listing from being published while its host is not `verified`. | MUST | GIVEN a host with `verification_status = 'pending'` WHEN they attempt to publish a completed listing THEN publication is refused with `HOST_NOT_VERIFIED` and the listing remains in `draft`. |
| FR-HOSTONB-005 | The system SHALL record a rejection reason on every rejected verification and SHALL surface it to the host with the ability to resubmit. | MUST | GIVEN an admin rejecting a verification with reason `ADDRESS_PROOF_ILLEGIBLE` WHEN the host next opens onboarding THEN the reason is displayed and the address proof step is reopened for resubmission. |
| FR-HOSTONB-006 | The system SHALL immediately unpublish all listings of a host moved to `suspended`, and SHALL leave existing `confirmed` and `active` bookings untouched pending admin action. | MUST | GIVEN a suspended host with 3 published listings and 1 `active` booking WHEN suspension takes effect THEN all 3 listings become unpublished, the `active` booking retains its state, and the admin queue receives a task to resolve that booking. |

---

## LISTING: space listing creation and management

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-LISTING-001 | The system SHALL provide a multi-step listing wizard that persists a `draft` at the end of every step and is resumable. | MUST | GIVEN a host who completes step 2 of 6 and closes the browser WHEN they return to `/host/listings` THEN the draft is listed and reopening it restores step 3 with all prior input intact. |
| FR-LISTING-002 | The system SHALL capture space type, capacity, bay dimensions, accepted vehicle size classes, access method, covered or open, and amenities. | MUST | GIVEN a completed listing WHEN it is read back THEN every captured attribute is returned exactly as entered with no silent defaulting of capacity. |
| FR-LISTING-003 | The system SHALL geocode the host-entered address through the server-side Nominatim proxy and SHALL require the host to confirm or drag a pin to the exact position. | MUST | GIVEN an address that geocodes to a point 200 metres from the true gate WHEN the host drags the pin to the gate and saves THEN `exact_lat` and `exact_lng` store the dragged position, not the geocoded one. |
| FR-LISTING-004 | The system SHALL compute and store `approx_lat` and `approx_lng` as a deterministic offset of 80 to 150 metres from the exact coordinate whenever the exact coordinate is written. | MUST | GIVEN a saved exact coordinate WHEN the row is written THEN `approx_lat` and `approx_lng` are populated, the distance between exact and approximate is between 80 and 150 metres, and rewriting the same exact coordinate produces the same approximate coordinate. |
| FR-LISTING-005 | The system SHALL require a cancellation policy of `flexible`, `moderate`, `strict` or `non_refundable` on every listing, and SHALL permit `non_refundable` only where the listing offers monthly or event inventory. | MUST | GIVEN an hourly-only listing WHEN the host selects `non_refundable` THEN the selection is refused with `POLICY_NOT_PERMITTED_FOR_INVENTORY`. |
| FR-LISTING-006 | The system SHALL require, before publication, at least the minimum photo count, a confirmed location, at least one price, at least one availability rule and a cancellation policy. | MUST | GIVEN a listing missing any one of these WHEN the host presses publish THEN publication is refused and the response names every unmet precondition, not only the first. |
| FR-LISTING-007 | The system SHALL set a published listing to `pending_review` where the host has fewer than one previously approved listing, and SHALL publish directly otherwise. | SHOULD | GIVEN a first-time verified host WHEN they publish THEN the listing status is `pending_review`, it is absent from public search, and it appears in the admin moderation queue. |
| FR-LISTING-008 | The system SHALL allow a host to unpublish a listing, and SHALL honour every existing `pending`, `confirmed` and `active` booking on that listing. | MUST | GIVEN a listing with 4 future confirmed bookings WHEN the host unpublishes it THEN it leaves search immediately, all 4 bookings remain valid and visible to their drivers, and no new booking can be created against it. |

---

## PHOTO: space photography

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-PHOTO-001 | The system SHALL accept JPEG, PNG and WebP uploads up to 10 MB each, up to 20 photos per listing, and SHALL reject any other content type. | MUST | GIVEN a 12 MB TIFF upload WHEN it is submitted THEN it is rejected with `UNSUPPORTED_MEDIA` before any byte is persisted. |
| FR-PHOTO-002 | The system SHALL require a minimum of 3 photos before a listing may be published. | MUST | GIVEN a listing with 2 photos WHEN the host presses publish THEN publication is refused with `INSUFFICIENT_PHOTOS` naming the minimum. |
| FR-PHOTO-003 | The system SHALL let a host reorder photos and designate one cover photo, and SHALL use the cover photo in search results and social previews. | MUST | GIVEN a host who sets photo 4 as cover WHEN the listing appears in search THEN the card renders photo 4. |
| FR-PHOTO-004 | The system SHALL strip EXIF metadata, including GPS coordinates, from every uploaded photo before it is stored in a publicly readable bucket. | MUST | GIVEN a photo containing GPS EXIF tags WHEN it is uploaded and then downloaded from the public URL THEN the downloaded file contains no GPS tags. |

---

## AVAIL: availability

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-AVAIL-001 | The system SHALL let a host define a weekly recurring availability schedule per listing, in local time, with per-day open and close windows. | MUST | GIVEN a schedule of Monday to Friday 18:00 to 08:00 next day WHEN availability is computed for a Wednesday THEN the bookable window spans 18:00 Wednesday to 08:00 Thursday. |
| FR-AVAIL-002 | The system SHALL let a host add date-specific overrides and blackout dates that take precedence over the weekly schedule. | MUST | GIVEN a weekly schedule that opens Saturday and a blackout on one specific Saturday WHEN search runs for that date THEN the listing returns no availability for that date and still returns availability on other Saturdays. |
| FR-AVAIL-003 | The system SHALL compute bookable intervals as the weekly schedule, adjusted by overrides, minus every booking in `pending`, `confirmed` or `active` on the relevant bay. | MUST | GIVEN a bay with a `pending` hold from 14:00 to 16:00 WHEN availability is computed THEN 14:00 to 16:00 is excluded from the bookable set for that bay. |
| FR-AVAIL-004 | The system SHALL enforce `MIN_BOOKING_MINUTES` and `MAX_BOOKING_DAYS` on every requested interval. | MUST | GIVEN `MIN_BOOKING_MINUTES = 30` WHEN a driver requests a 20 minute interval THEN the request is refused with `DURATION_BELOW_MINIMUM`, and GIVEN `MAX_BOOKING_DAYS = 90` WHEN a 91 day interval is requested THEN it is refused with `DURATION_ABOVE_MAXIMUM`. |
| FR-AVAIL-005 | The system SHALL expose availability for a listing with `capacity > 1` as the union across all bays, and SHALL report the count of free bays for any queried interval. | MUST | GIVEN a listing with capacity 3 and 2 bays booked from 10:00 to 12:00 WHEN availability is queried for that interval THEN the listing is returned as available with `free_bays = 1`. |
| FR-AVAIL-006 | The system SHALL let a host block a specific bay for maintenance, creating a reservation that participates in the overlap constraint. | SHOULD | GIVEN bay 2 blocked from 09:00 to 17:00 WHEN a driver attempts to book bay 2 at 11:00 THEN allocation skips bay 2 and either assigns another free bay or returns `SPACE_NO_LONGER_AVAILABLE`. |

---

## SEARCH: discovery

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-SEARCH-001 | The system SHALL accept a free text location, resolve it through the server-side Nominatim proxy, and return listings ordered by distance from the resolved point. | MUST | GIVEN the query "Park Street Kolkata" WHEN search executes THEN the resolved centre is within Park Street and results are ordered by ascending distance from that centre. |
| FR-SEARCH-002 | The system SHALL proxy every Nominatim request server side with a compliant User-Agent, SHALL cache results, and SHALL never exceed one upstream request per second. | MUST | GIVEN 20 identical geocode queries within one minute WHEN they are served THEN at most one upstream Nominatim request is made and the remaining 19 are served from cache. |
| FR-SEARCH-003 | The system SHALL require a start time and an end time on every availability-aware search and SHALL only return listings bookable for that entire interval. | MUST | GIVEN a listing free from 10:00 to 11:00 only WHEN a search runs for 10:00 to 12:00 THEN that listing is not returned. |
| FR-SEARCH-004 | The system SHALL support filters for price ceiling, vehicle size class, covered or open, amenities, instant book and maximum walking distance. | MUST | GIVEN a price ceiling of Rs 60 per hour WHEN search executes THEN every returned listing has an effective hourly rate at or below 6000 paise for the queried interval. |
| FR-SEARCH-005 | The system SHALL return, for each result, the jittered coordinate, street and locality only, and SHALL never return the exact coordinate, full address, gate number or access instructions. | MUST | GIVEN any unauthenticated or authenticated search response WHEN the payload is inspected THEN it contains `approx_lat` and `approx_lng` and contains no `exact_lat`, `exact_lng`, `full_address`, `gate_number` or `access_instructions` field. |
| FR-SEARCH-006 | The system SHALL paginate results with a stable cursor and SHALL return the total count of matches. | MUST | GIVEN 87 matches and a page size of 20 WHEN the driver pages forward and back THEN no result is duplicated or skipped and the reported total is 87 throughout. |
| FR-SEARCH-007 | The system SHALL return an empty-state response that suggests widening the radius or shifting the time window when zero results match. | SHOULD | GIVEN a search that matches nothing WHEN the response renders THEN it offers at least one concrete alternative, such as the nearest available listing outside the radius or the nearest free time window. |

---

## MAP: map interface

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-MAP-001 | The system SHALL render search results on a MapLibre GL map using OpenStreetMap raster tiles, with no API key required. | MUST | GIVEN a fresh deployment with no map credentials configured WHEN the search page loads THEN tiles render and no request carries an API key parameter. |
| FR-MAP-002 | The system SHALL place markers at the jittered coordinate only. | MUST | GIVEN a listing whose exact position is known to the server WHEN its marker renders THEN the marker sits at `approx_lat` and `approx_lng`, and the exact position is absent from every network response the browser receives. |
| FR-MAP-003 | The system SHALL re-run search against the visible bounding box when the user pans or zooms, debounced, with an explicit "search this area" control rather than uncontrolled automatic refetching. | MUST | GIVEN a user panning the map WHEN movement stops THEN at most one search request is issued after the debounce interval and the result list updates to match the new viewport. |
| FR-MAP-004 | The system SHALL cluster markers above a density threshold and SHALL expand a cluster on click. | SHOULD | GIVEN 60 listings inside the viewport WHEN the map renders at city zoom THEN markers are clustered, and clicking a cluster zooms to its bounds. |
| FR-MAP-005 | The system SHALL link the result list and the map bidirectionally, and SHALL provide a list-only mode reachable by keyboard for users who cannot operate the map. | MUST | GIVEN a keyboard-only user WHEN they tab through the page THEN they reach a control that switches to a list-only view, and every result remains operable without any pointer interaction with the map canvas. |

---

## DETAIL: listing detail page

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-DETAIL-001 | The system SHALL render a listing detail page server side, including photos, amenities, price table, cancellation policy, host summary and reviews. | MUST | GIVEN a published listing WHEN its page is requested with JavaScript disabled THEN the photos, prices, policy and reviews are present in the initial HTML. |
| FR-DETAIL-002 | The system SHALL display the jittered location with a radius indicator and an explicit statement that the exact address is released after booking. | MUST | GIVEN a visitor viewing a listing WHEN the map section renders THEN a circle centred on the approximate coordinate is shown together with the text explaining that the exact address is shared after confirmation. |
| FR-DETAIL-003 | The system SHALL display an availability calendar showing which days and hours are bookable for the coming 90 days. | MUST | GIVEN a listing fully booked tomorrow WHEN the calendar renders THEN tomorrow is shown as unavailable without revealing who booked it. |
| FR-DETAIL-004 | The system SHALL display aggregate review statistics and individual reviews with the reviewer's display name and date, and SHALL not display reviewer contact details. | MUST | GIVEN 12 published reviews WHEN the page renders THEN the average rating, the count and the individual reviews are shown and no email address or phone number appears. |
| FR-DETAIL-005 | The system SHALL return HTTP 404 for an unpublished, rejected or deleted listing requested by a user who is not its host, `admin` or `support`. | MUST | GIVEN an unpublished listing WHEN an anonymous visitor requests its URL THEN the response status is 404 and no listing content is leaked in the body. |

---

## QUOTE: pricing quotation

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-QUOTE-001 | The system SHALL compute every quote server side using the kernel money model and SHALL return each component separately: `base_amount`, `discount_amount`, `taxable_amount`, `service_fee`, `tax_amount`, `total_amount`. | MUST | GIVEN a `base_amount` of 20000 paise and no discount WHEN the quote is computed with `DRIVER_SERVICE_FEE_PCT = 0.05` and `GST_PCT = 0.18` THEN `service_fee = 1000`, `tax_amount = 180` and `total_amount = 21180`. |
| FR-QUOTE-002 | The system SHALL perform every monetary calculation in integer paise and SHALL apply rounding exactly once per component, at the point specified by the kernel formula. | MUST | GIVEN a `taxable_amount` of 3333 paise WHEN the service fee is computed THEN the stored value is `round(3333 * 0.05) = 167` paise and no intermediate floating point value is persisted anywhere. |
| FR-QUOTE-003 | The system SHALL compute `host_commission` as `round(taxable_amount * HOST_COMMISSION_PCT)` and `host_payout` as `taxable_amount - host_commission`, and SHALL store both on the booking at confirmation time. | MUST | GIVEN a `taxable_amount` of 20000 paise and `HOST_COMMISSION_PCT = 0.10` WHEN the booking confirms THEN `host_commission = 2000`, `host_payout = 18000` and `platform_revenue = service_fee + host_commission`. |
| FR-QUOTE-004 | The system SHALL read every rate from `platform_settings` at quote time, and SHALL never hard-code a rate in application code. | MUST | GIVEN an admin changing `DRIVER_SERVICE_FEE_PCT` from 0.05 to 0.06 WHEN the next quote is requested THEN the new rate applies with no deployment and no process restart. |
| FR-QUOTE-005 | The system SHALL freeze the quote onto the booking at hold creation, so that a settings change after the hold does not alter the price the driver pays. | MUST | GIVEN a hold created at rate 0.05 WHEN an admin changes the rate to 0.06 and the driver then pays THEN the charged total equals the frozen quoted total. |
| FR-QUOTE-006 | The system SHALL apply a dynamic multiplier drawn from the host's configured day-type rules, and SHALL disclose the multiplier in the quote breakdown. | SHOULD | GIVEN a weekend multiplier of 1.25 WHEN a Saturday quote is computed THEN `base_amount` reflects the multiplier and the breakdown names it explicitly. |

---

## BOOKING: booking lifecycle

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-BOOKING-001 | The system SHALL guarantee that two bookings in `pending`, `confirmed` or `active` cannot hold overlapping intervals on the same `(space_id, bay_index)` pair, enforced by a Postgres GiST exclusion constraint. | MUST | GIVEN two concurrent transactions requesting 10:00 to 12:00 on bay 1 of the same space WHEN both attempt to commit THEN exactly one commits and the other receives an exclusion violation. |
| FR-BOOKING-002 | The system SHALL translate an exclusion constraint violation into the error `SPACE_NO_LONGER_AVAILABLE` and SHALL present the driver with alternative bays or nearby listings. | MUST | GIVEN a losing concurrent booking attempt WHEN the constraint fires THEN the API returns `SPACE_NO_LONGER_AVAILABLE` with HTTP 409, no partial booking row persists, and the UI offers at least one alternative. |
| FR-BOOKING-003 | The system SHALL assign a specific `bay_index` to every booking on a listing with `capacity > 1`, and SHALL never leave `bay_index` null on a confirmed booking. | MUST | GIVEN a listing with capacity 4 WHEN a booking confirms THEN `bay_index` holds exactly one integer in the range 1 to 4 and that value is recorded on the access pass. |
| FR-BOOKING-004 | The system SHALL enforce the legal state transitions of the kernel state machine with a database trigger, and SHALL reject any other transition. | MUST | GIVEN a booking in `completed` WHEN any actor attempts to set it to `pending` THEN the database raises an error, the row is unchanged, and the attempt is written to the audit log. |
| FR-BOOKING-005 | The system SHALL support instant book and request to book per listing, and SHALL place a request-to-book reservation in `pending` awaiting host acceptance. | MUST | GIVEN a request-to-book listing WHEN a driver submits a request THEN the booking is `pending`, the interval is already held against the exclusion constraint, and the host receives a notification with a response deadline. |
| FR-BOOKING-006 | The system SHALL expire an unanswered request to book after the host response window and SHALL release the interval. | MUST | GIVEN a request-to-book `pending` booking untouched past its response deadline WHEN the scheduled job runs THEN the booking becomes `expired`, no charge is made, and the interval is bookable again. |
| FR-BOOKING-007 | The system SHALL transition a `confirmed` booking to `active` on successful check-in, and to `no_show` if no check-in occurs by the end of the grace period. | MUST | GIVEN a booking starting at 10:00 with `GRACE_PERIOD_MINUTES = 10` and no check-in by 10:10 WHEN the sweep job runs THEN the booking becomes `no_show` and the host payout follows the no-show rule. |
| FR-BOOKING-008 | The system SHALL allow a driver to extend an `active` booking only when the immediately following interval on the same bay is free, and SHALL price the extension as a new quote appended to the same booking. | MUST | GIVEN an `active` booking ending at 12:00 and no booking on that bay until 14:00 WHEN the driver extends to 13:00 THEN the booking end moves to 13:00, the additional amount is charged, and the exclusion constraint accepts the widened interval. |
| FR-BOOKING-009 | The system SHALL refuse an extension that would overlap a subsequent booking and SHALL tell the driver the latest possible end time. | MUST | GIVEN an `active` booking ending at 12:00 and a confirmed booking on the same bay from 12:30 WHEN the driver requests an extension to 14:00 THEN the request is refused with `EXTENSION_BLOCKED` and the response names 12:30 as the latest end. |

---

## HOLD: inventory hold

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-HOLD-001 | The system SHALL create a `pending` booking that participates in the exclusion constraint the moment a driver begins checkout, thereby locking the interval while payment proceeds. | MUST | GIVEN a driver entering checkout for 10:00 to 12:00 WHEN the hold is created THEN a second driver querying that interval sees it as unavailable. |
| FR-HOLD-002 | The system SHALL expire a hold after `BOOKING_HOLD_MINUTES`, default 10, through a scheduled job that moves the booking to `expired` and releases the interval. | MUST | GIVEN a `pending` hold created 11 minutes ago with no payment WHEN the expiry job runs THEN the booking is `expired` and the interval is immediately bookable by another driver. |
| FR-HOLD-003 | The system SHALL display the remaining hold time to the driver throughout checkout and SHALL warn at 2 minutes remaining. | MUST | GIVEN a hold with 2 minutes left WHEN the checkout page is open THEN a visible countdown and a warning are presented. |
| FR-HOLD-004 | The system SHALL, where a hold expires while a payment is in flight, complete the payment capture and then either reinstate the same interval if it is still free, or refund in full if it is not. | MUST | GIVEN a hold that expires at the instant a payment succeeds WHEN reconciliation runs THEN either the booking is confirmed on the original interval because nothing else claimed it, or a full refund is issued within 15 minutes and the driver is notified with the reason. |
| FR-HOLD-005 | The system SHALL permit a driver to hold at most 3 concurrent `pending` bookings, to prevent inventory starvation. | SHOULD | GIVEN a driver holding 3 `pending` bookings WHEN they begin a 4th checkout THEN the request is refused with `TOO_MANY_ACTIVE_HOLDS`. |
| FR-HOLD-006 | The system SHALL release a hold immediately when the driver abandons checkout through an explicit cancel action, without waiting for the expiry job. | MUST | GIVEN a driver pressing "cancel" on the payment screen WHEN the action completes THEN the booking is `cancelled`, the interval is released in the same transaction, and no refund record is created because no charge occurred. |

---

## PAYMENT: payment capture

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-PAYMENT-001 | The system SHALL implement payments behind a provider abstraction with a zero-configuration mock provider and a Razorpay adapter, selected by configuration. | MUST | GIVEN no gateway credentials configured WHEN a driver completes checkout THEN the mock provider completes the full loop and the booking reaches `confirmed`. |
| FR-PAYMENT-002 | The system SHALL create a payment intent for the exact frozen `total_amount` in paise and SHALL never send a rounded or recomputed amount to the provider. | MUST | GIVEN a frozen total of 21180 paise WHEN the intent is created THEN the provider receives amount 21180 and currency INR. |
| FR-PAYMENT-003 | The system SHALL make payment initiation idempotent on a client-supplied idempotency key, so that a double-clicked pay button produces exactly one charge. | MUST | GIVEN two identical initiation requests with the same idempotency key arriving 50 ms apart WHEN both are processed THEN exactly one provider intent exists and the second request returns the first result. |
| FR-PAYMENT-004 | The system SHALL confirm a booking only on a verified provider signal, and SHALL never confirm on a client-side success callback alone. | MUST | GIVEN a forged client callback claiming success WHEN it is received THEN the booking remains `pending`, no confirmation notification is sent, and the attempt is audited. |
| FR-PAYMENT-005 | The system SHALL verify the cryptographic signature of every inbound webhook and SHALL reject any webhook failing verification. | MUST | GIVEN a webhook with an invalid signature WHEN it is received THEN the response is HTTP 401, no state changes, and the event is logged as a security event. |
| FR-PAYMENT-006 | The system SHALL process webhooks idempotently by provider event identifier, so that a duplicate delivery causes no second state change and no second notification. | MUST | GIVEN the same `payment.captured` event delivered twice WHEN both are processed THEN the booking confirms once, exactly one confirmation email is sent, and the second delivery returns HTTP 200 with no side effect. |
| FR-PAYMENT-007 | The system SHALL accept and correctly process a webhook that arrives after the hold has expired, after the booking was cancelled, or out of order relative to other events for the same payment. | MUST | GIVEN a `payment.captured` webhook for a booking already `expired` WHEN it is processed THEN no booking state is illegally changed, a full refund is initiated automatically, and the driver is notified within 15 minutes. |
| FR-PAYMENT-008 | The system SHALL reconcile, on a schedule, every payment recorded at the provider against every booking in the local database, and SHALL raise an operational alert for any mismatch. | MUST | GIVEN a captured payment with no corresponding `confirmed` booking WHEN reconciliation runs THEN the discrepancy is written to the reconciliation table, an alert fires, and the booking is either confirmed or refunded within 15 minutes. |
| FR-PAYMENT-009 | The system SHALL write an immutable payment ledger entry for every money movement, and SHALL guarantee that the sum of movements equals the recorded balance at every nightly close. | MUST | GIVEN a day with 120 payments, 6 refunds and 14 wallet credits WHEN the nightly integrity check runs THEN the ledger sum equals the balance sum with a difference of exactly zero paise. |
| FR-PAYMENT-010 | The system SHALL present a clear failure path when payment fails, keeping the hold alive for the remainder of its window and allowing retry without re-entering booking details. | MUST | GIVEN a declined card with 6 minutes of hold remaining WHEN the driver retries with another method THEN the same `pending` booking is reused, the interval is still held, and no new hold is created. |

---

## REFUND: refunds

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-REFUND-001 | The system SHALL compute a refund amount from the listing's cancellation policy, the time remaining before start, and the kernel rule that the service fee is retained on a driver cancellation and refunded on a host cancellation. | MUST | GIVEN a `moderate` policy, a driver cancelling 30 hours before start WHEN the refund is computed THEN the full `taxable_amount` is refunded and the `service_fee` and its `tax_amount` are retained. |
| FR-REFUND-002 | The system SHALL refund the service fee and its tax in full when the host cancels, regardless of policy. | MUST | GIVEN any policy and a host cancellation WHEN the refund is computed THEN the refunded amount equals the full `total_amount`. |
| FR-REFUND-003 | The system SHALL show the driver the exact refund amount, itemised, before the cancellation is committed. | MUST | GIVEN a driver opening the cancel dialog WHEN it renders THEN it shows the refundable amount, the retained amount and the policy clause applied, and cancellation requires an explicit confirmation. |
| FR-REFUND-004 | The system SHALL issue refunds through the same provider adapter used for the original charge and SHALL support partial refunds. | MUST | GIVEN a charge made through the mock provider WHEN a 50 percent refund is issued THEN the mock provider records a refund for exactly half the original amount in paise and the ledger reflects it. |
| FR-REFUND-005 | The system SHALL make refund issuance idempotent, so that a retried refund request does not produce a second refund. | MUST | GIVEN a refund request retried after a network timeout WHEN it is reprocessed THEN exactly one refund exists at the provider and the ledger contains exactly one refund entry. |
| FR-REFUND-006 | The system SHALL allow an admin to issue a full or partial discretionary refund with a mandatory reason code, recorded in the audit log. | MUST | GIVEN an admin issuing a goodwill refund of Rs 200 WHEN it is submitted without a reason code THEN it is refused, and WHEN a reason code is supplied THEN the refund is issued and an audit entry names the admin, the amount and the reason. |

---

## ACCESS: QR pass, check-in, check-out, overstay

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-ACCESS-001 | The system SHALL issue a QR access pass on booking confirmation, encoding a signed, single-booking token that does not embed the exact address. | MUST | GIVEN a confirmed booking WHEN the pass renders THEN it contains a signed token and decoding the QR yields no address, coordinate or personal data beyond an opaque identifier. |
| FR-ACCESS-002 | The system SHALL release the exact coordinate, full address, gate number and access instructions to the booking driver only, and only from 24 hours before the booking start, enforced by Row Level Security. | MUST | GIVEN a confirmed booking starting in 30 hours WHEN the driver queries the booking THEN the address fields are absent, and GIVEN the same booking 23 hours before start WHEN it is queried again THEN the address fields are present. |
| FR-ACCESS-003 | The system SHALL deny the exact location to any user other than the booking driver, the listing host, `admin` and `support`, at all times. | MUST | GIVEN a second driver with a valid session WHEN they request the first driver's booking detail THEN the response is 404 and no location field is leaked. |
| FR-ACCESS-004 | The system SHALL permit check-in from `GRACE_PERIOD_MINUTES` before the booking start until `GRACE_PERIOD_MINUTES` after the booking start, and SHALL refuse it outside that window. | MUST | GIVEN a booking starting at 10:00 and `GRACE_PERIOD_MINUTES = 10` WHEN check-in is attempted at 09:45 THEN it is refused with `CHECKIN_TOO_EARLY`, and WHEN it is attempted at 10:05 THEN it succeeds and the booking becomes `active`. |
| FR-ACCESS-005 | The system SHALL provide a manual numeric fallback code for check-in where the QR cannot be scanned. | MUST | GIVEN a gate attendant unable to scan WHEN they enter the booking's 6 digit code THEN check-in succeeds identically to a QR scan and the method is recorded as `manual`. |
| FR-ACCESS-006 | The system SHALL allow a host, operator or staff seat to scan a driver's pass at the gate, and SHALL show them the vehicle registration, the bay index and the booked interval only. | MUST | GIVEN a staff member scanning a valid pass WHEN the result renders THEN the registration, bay and interval are shown and the driver's email address and phone number are not. |
| FR-ACCESS-007 | The system SHALL transition an `active` booking to `completed` on check-out, and SHALL record the actual check-out time. | MUST | GIVEN an `active` booking WHEN the driver checks out at 11:47 THEN the state becomes `completed` and `checked_out_at` records 11:47. |
| FR-ACCESS-008 | The system SHALL detect an overstay when the current time exceeds the booked end plus `GRACE_PERIOD_MINUTES` with no check-out, and SHALL notify both the driver and the host. | MUST | GIVEN a booking ending at 12:00 with no check-out by 12:10 WHEN the overstay sweep runs THEN the booking is flagged as overstaying and both parties receive a notification. |
| FR-ACCESS-009 | The system SHALL compute an overstay charge at the listing's overstay rate in whole units of the configured overstay increment, and SHALL record it as a receivable against the driver. | MUST | GIVEN an overstay of 75 minutes, an increment of 30 minutes and a rate of Rs 40 per increment WHEN the charge is computed THEN it equals 3 increments at 4000 paise each, totalling 12000 paise, recorded against the driver. |

---

## CANCEL: cancellation

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-CANCEL-001 | The system SHALL allow a driver to cancel a `pending` or `confirmed` booking at any time before the booking start. | MUST | GIVEN a confirmed booking starting tomorrow WHEN the driver cancels THEN the state becomes `cancelled`, the interval is released, and the policy-derived refund is initiated. |
| FR-CANCEL-002 | The system SHALL apply the `flexible` policy as a full refund up to 1 hour before start. | MUST | GIVEN a `flexible` listing and a cancellation 61 minutes before start WHEN the refund is computed THEN the `taxable_amount` is refunded in full, and GIVEN a cancellation 59 minutes before start THEN the full refund is not granted. |
| FR-CANCEL-003 | The system SHALL apply the `moderate` policy as a full refund up to 24 hours before start and half after that. | MUST | GIVEN a `moderate` listing and a cancellation 23 hours before start WHEN the refund is computed THEN exactly half the `taxable_amount` is refunded, rounded in paise. |
| FR-CANCEL-004 | The system SHALL apply the `strict` policy as half up to 48 hours before start and nothing after. | MUST | GIVEN a `strict` listing and a cancellation 47 hours before start WHEN the refund is computed THEN the refundable amount is exactly zero. |
| FR-CANCEL-005 | The system SHALL apply the `non_refundable` policy as no refund once the booking is confirmed, and SHALL permit this policy only on monthly and event inventory. | MUST | GIVEN a `non_refundable` monthly booking WHEN the driver cancels one hour after confirming THEN the refundable amount is zero and the dialog stated that before confirmation. |
| FR-CANCEL-006 | The system SHALL allow a host to cancel a `confirmed` booking, SHALL issue a full refund including the service fee, SHALL apply a reliability penalty, and SHALL require a reason. | MUST | GIVEN a host cancelling a confirmed booking WHEN the cancellation completes THEN the driver is refunded the full `total_amount`, the host's reliability score decreases, the reason is stored, and the driver receives a notification offering alternative nearby listings. |

---

## REVIEW: two-sided reviews

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-REVIEW-001 | The system SHALL permit a review only from a party to a booking in `completed`, and only within 14 days of completion. | MUST | GIVEN a booking completed 15 days ago WHEN the driver attempts to review THEN the request is refused with `REVIEW_WINDOW_CLOSED`. |
| FR-REVIEW-002 | The system SHALL support two-sided reviews, driver about space and host about driver, each with a 1 to 5 rating and optional free text. | MUST | GIVEN a completed booking WHEN both parties submit THEN two review rows exist, one in each direction, each bound to the same booking identifier. |
| FR-REVIEW-003 | The system SHALL withhold both reviews from public display until both are submitted or the 14 day window closes, whichever is earlier. | SHOULD | GIVEN only the driver has reviewed on day 3 WHEN the listing page renders THEN that review is not shown, and GIVEN the window closes on day 14 with only that review THEN it becomes visible. |
| FR-REVIEW-004 | The system SHALL prevent a user from editing a review once the counterpart review is visible. | MUST | GIVEN both reviews published WHEN the driver attempts to edit theirs THEN the edit is refused with `REVIEW_LOCKED`. |
| FR-REVIEW-005 | The system SHALL recompute a listing's aggregate rating and review count whenever a review is published or removed. | MUST | GIVEN a listing with average 4.5 over 10 reviews WHEN an admin removes a 1 star review THEN the aggregate recomputes over 9 reviews within one minute. |

---

## MESSAGE: in-booking messaging

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-MESSAGE-001 | The system SHALL scope every message thread to a single booking, with exactly two participants, the driver and the listing host or their staff. | MUST | GIVEN a booking WHEN a thread is created THEN it is bound to that booking identifier and no third user can read or post to it. |
| FR-MESSAGE-002 | The system SHALL open a thread when a booking reaches `pending` and SHALL close it to new messages 7 days after the booking reaches a terminal state. | MUST | GIVEN a booking completed 8 days ago WHEN either party attempts to post THEN the post is refused with `THREAD_CLOSED` and the history remains readable. |
| FR-MESSAGE-003 | The system SHALL redact obvious phone numbers and email addresses from message bodies before a booking is confirmed. | SHOULD | GIVEN a `pending` booking WHEN the host sends a message containing a 10 digit phone number THEN the recipient sees it redacted and the original is retained for moderation. |
| FR-MESSAGE-004 | The system SHALL notify the recipient of a new message according to their notification preferences, and SHALL mark the thread unread until opened. | MUST | GIVEN a driver with email notifications enabled WHEN the host posts a message THEN an email is dispatched once and the thread shows an unread indicator in the driver's inbox. |

---

## NOTIFY: notifications

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-NOTIFY-001 | The system SHALL deliver notifications through an in-app centre, email, and optionally SMS, according to per-user channel preferences. | MUST | GIVEN a user with SMS disabled WHEN a booking confirms THEN an in-app entry and an email are created and no SMS is dispatched. |
| FR-NOTIFY-002 | The system SHALL send booking confirmation, booking reminder 24 hours before start, check-in reminder, overstay alert, cancellation notice, refund notice, review request and payout notice. | MUST | GIVEN a booking that runs the full happy path WHEN it completes THEN the driver has received the confirmation, the 24 hour reminder, the check-in reminder and the review request, each exactly once. |
| FR-NOTIFY-003 | The system SHALL make notification dispatch idempotent per event, so that a retried job does not send a duplicate. | MUST | GIVEN a dispatch job retried after a timeout WHEN it reruns THEN the recipient receives exactly one message for that event. |
| FR-NOTIFY-004 | The system SHALL never include the exact address in a notification sent more than 24 hours before booking start. | MUST | GIVEN a confirmation email for a booking starting in 5 days WHEN the email body is inspected THEN it contains the locality and not the full address, and it links to the booking page where the address appears at the permitted time. |
| FR-NOTIFY-005 | The system SHALL provide an unsubscribe path for non-transactional email and SHALL continue to send transactional email regardless of that preference. | MUST | GIVEN a user who unsubscribes from marketing email WHEN a booking confirmation is triggered THEN the confirmation is still delivered. |

---

## WALLET: credit wallet

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-WALLET-001 | The system SHALL maintain a wallet balance in integer paise per user, backed by an append-only ledger of credits and debits. | MUST | GIVEN a wallet with entries of plus 50000 and minus 12000 paise WHEN the balance is read THEN it equals 38000 paise and is derived from the ledger, not stored independently as the source of truth. |
| FR-WALLET-002 | The system SHALL apply wallet credit within `discount_amount`, and SHALL never allow `discount_amount` to exceed `base_amount`. | MUST | GIVEN a `base_amount` of 20000 paise and a wallet balance of 25000 paise WHEN the driver applies the wallet THEN at most 20000 paise is applied, `taxable_amount` is zero, and the remaining wallet balance is 5000 paise. |
| FR-WALLET-003 | The system SHALL debit the wallet only at successful payment capture, and SHALL release any reserved wallet amount if the payment fails or the hold expires. | MUST | GIVEN a wallet amount reserved during a hold WHEN the hold expires THEN the reservation is released and the balance returns to its prior value. |
| FR-WALLET-004 | The system SHALL credit refunds of wallet-funded amounts back to the wallet and gateway-funded amounts back to the original payment method. | MUST | GIVEN a booking paid with 5000 paise of wallet and 16180 paise of card WHEN a full refund is issued THEN 5000 paise returns to the wallet and 16180 paise returns to the card. |
| FR-WALLET-005 | The system SHALL prevent the wallet balance from going negative under any sequence of operations. | MUST | GIVEN two concurrent debits of 30000 paise each against a 40000 paise balance WHEN both are attempted THEN exactly one succeeds, the other fails with `INSUFFICIENT_WALLET_BALANCE`, and the balance never falls below zero. |

---

## COUPON: promotional codes

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-COUPON-001 | The system SHALL support percentage and fixed-amount coupons with a maximum discount cap, a validity window, a global redemption cap and a per-user redemption cap. | MUST | GIVEN a 20 percent coupon capped at Rs 100 WHEN it is applied to a Rs 800 base THEN the discount is exactly 10000 paise, not 16000 paise. |
| FR-COUPON-002 | The system SHALL validate a coupon server side at quote time and again at payment capture, and SHALL reject an expired or exhausted coupon at either point. | MUST | GIVEN a coupon that reaches its global cap between quote and capture WHEN capture is attempted THEN the charge is refused with `COUPON_EXHAUSTED` and the driver is offered a requote without the coupon. |
| FR-COUPON-003 | The system SHALL enforce the per-user redemption cap atomically so that concurrent redemptions cannot exceed it. | MUST | GIVEN a per-user cap of 1 and two concurrent bookings applying the same coupon WHEN both attempt capture THEN exactly one succeeds and the other receives `COUPON_ALREADY_USED`. |
| FR-COUPON-004 | The system SHALL apply a coupon only inside `discount_amount`, never to the service fee or to the tax. | MUST | GIVEN any coupon WHEN the quote is computed THEN `service_fee` is derived from the post-discount `taxable_amount` and no coupon value is applied directly to `service_fee` or `tax_amount`. |
| FR-COUPON-005 | The system SHALL restore a coupon redemption to the available pool when the associated booking is cancelled before start with a full refund. | SHOULD | GIVEN a coupon redeemed on a booking cancelled under `flexible` with a full refund WHEN the cancellation completes THEN the redemption count decrements and the user may use the coupon again if still within its validity window. |

---

## REFERRAL: referrals

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-REFERRAL-001 | The system SHALL issue every user a unique referral code and a shareable link. | MUST | GIVEN a newly created account WHEN the referrals page opens THEN a unique code exists and the link resolves to the landing page with the code attached. |
| FR-REFERRAL-002 | The system SHALL attribute a new signup to a referral code captured at signup time and SHALL not permit self-referral. | MUST | GIVEN a user attempting to apply their own code WHEN they sign up THEN attribution is refused with `SELF_REFERRAL_NOT_ALLOWED`. |
| FR-REFERRAL-003 | The system SHALL credit both referrer and referee only after the referee's first booking reaches `completed`. | MUST | GIVEN a referred user whose first booking is `confirmed` but not yet completed WHEN the wallet is inspected THEN no referral credit exists, and GIVEN the booking reaches `completed` THEN both wallets are credited exactly once. |
| FR-REFERRAL-004 | The system SHALL cap referral credits per referrer per calendar month. | SHOULD | GIVEN a monthly cap of 10 and a referrer who has earned 10 credits this month WHEN an 11th referee completes a booking THEN no further credit is issued and the referrer is informed of the cap. |

---

## HOSTDASH: host dashboard

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-HOSTDASH-001 | The system SHALL present a host with today's arrivals, today's departures, pending booking requests, and unread messages on a single dashboard. | MUST | GIVEN a host with 3 arrivals today and 1 pending request WHEN the dashboard loads THEN all 4 items are visible without navigation. |
| FR-HOSTDASH-002 | The system SHALL provide a calendar in month and week views showing every booking across every listing owned by the host. | MUST | GIVEN a host with 2 listings WHEN the week view renders THEN bookings from both listings appear, each labelled with listing and bay. |
| FR-HOSTDASH-003 | The system SHALL allow a host to accept or decline a request-to-book from the dashboard within the response window, with a mandatory reason on decline. | MUST | GIVEN a pending request WHEN the host declines without selecting a reason THEN the action is refused, and WHEN a reason is selected THEN the booking is `cancelled`, the interval is released and the driver is notified. |
| FR-HOSTDASH-004 | The system SHALL display the host's reliability score with a plain-language explanation of what changes it. | SHOULD | GIVEN a host who cancelled one confirmed booking WHEN the dashboard renders THEN the score reflects the penalty and names the cancellation as the cause. |

---

## EARNINGS: host earnings and payouts

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-EARNINGS-001 | The system SHALL report host earnings as gross `taxable_amount`, `host_commission` and `host_payout`, per booking and aggregated by period and by listing. | MUST | GIVEN one completed booking with `taxable_amount` 20000 paise WHEN earnings render THEN gross shows Rs 200, commission shows Rs 20 and net shows Rs 180. |
| FR-EARNINGS-002 | The system SHALL move a booking's payout from pending to available only after the booking reaches `completed` and its dispute window has closed. | MUST | GIVEN a booking completed 1 hour ago with a 48 hour dispute window WHEN the balance is read THEN the payout sits in pending, and GIVEN 49 hours have passed with no dispute THEN it sits in available. |
| FR-EARNINGS-003 | The system SHALL hold a payout for any booking in `disputed` until the dispute is resolved. | MUST | GIVEN a disputed booking WHEN the payout batch runs THEN that booking's payout is excluded and the host sees it marked as held with the reason. |
| FR-EARNINGS-004 | The system SHALL let a host request a withdrawal against the available balance, subject to a configurable minimum. | MUST | GIVEN an available balance of Rs 350 and a minimum of Rs 500 WHEN the host requests a withdrawal THEN it is refused with `BELOW_MINIMUM_PAYOUT` and the shortfall is shown. |
| FR-EARNINGS-005 | The system SHALL produce a downloadable settlement statement per period listing every booking, its gross, its commission and its net. | SHOULD | GIVEN a month with 24 completed bookings WHEN the host downloads the statement THEN it contains 24 rows and its net total equals the sum of the per-booking nets to the paise. |

---

## ADMIN: administration

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-ADMIN-001 | The system SHALL restrict every admin route and every admin API to users holding `admin`, enforced by Row Level Security in addition to routing. | MUST | GIVEN a `host` session WHEN it calls an admin API directly THEN the response is 403 and no data is returned. |
| FR-ADMIN-002 | The system SHALL let an admin edit every key in `platform_settings` at runtime, with the previous value retained in the audit log. | MUST | GIVEN an admin changing `BOOKING_HOLD_MINUTES` from 10 to 15 WHEN the change is saved THEN new holds use 15 minutes, existing holds keep their original expiry, and the audit log records old and new values. |
| FR-ADMIN-003 | The system SHALL let an admin search users, view a user's bookings, listings and ledger, and suspend or restore an account with a mandatory reason. | MUST | GIVEN an admin suspending a user without a reason WHEN the action is submitted THEN it is refused, and WHEN a reason is supplied THEN the account is suspended and the reason is auditable. |
| FR-ADMIN-004 | The system SHALL let an admin force a booking state transition that the normal machine forbids, with a mandatory reason, and SHALL record it distinctly as an administrative override. | MUST | GIVEN a stuck `active` booking WHEN an admin forces it to `completed` with a reason THEN the transition succeeds, the audit entry is flagged as an override, and analytics exclude it from organic completion metrics. |
| FR-ADMIN-005 | The system SHALL provide an admin dashboard showing the North Star Metric, GMV, take rate, live supply count and open queue depths. | MUST | GIVEN the admin dashboard WHEN it loads THEN completed parking hours for the current and previous week are displayed alongside GMV and the counts of open verifications, moderations and disputes. |

---

## MODERATION: content moderation

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-MODERATION-001 | The system SHALL queue every first listing from a host for moderation before it becomes publicly searchable. | MUST | GIVEN a first listing published by a verified host WHEN moderation is pending THEN the listing is absent from search results and present in the moderation queue. |
| FR-MODERATION-002 | The system SHALL let a moderator approve, reject with reason, or request changes on a listing, and SHALL notify the host of the outcome. | MUST | GIVEN a moderator requesting changes with a note WHEN the action completes THEN the listing returns to `draft`, the note is visible to the host, and the host receives a notification. |
| FR-MODERATION-003 | The system SHALL let a moderator remove an individual photo without rejecting the whole listing. | MUST | GIVEN a listing with one non-compliant photo WHEN the moderator removes it THEN that photo is deleted from the public bucket, the listing remains published if it still meets the minimum photo count, and it is returned to draft if it does not. |
| FR-MODERATION-004 | The system SHALL let a moderator remove a review with a mandatory reason and SHALL recompute the affected aggregates. | MUST | GIVEN an abusive review WHEN it is removed with reason `ABUSIVE_LANGUAGE` THEN it disappears from the listing page, the aggregate rating recomputes, and the audit log records the moderator and the reason. |
| FR-MODERATION-005 | The system SHALL let any signed in user report a listing, review or message, creating a moderation task. | SHOULD | GIVEN a driver reporting a listing WHEN the report is submitted THEN a moderation task exists with the reporter, the target and the category, and the reporter receives an acknowledgement. |

---

## DISPUTE: dispute resolution

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-DISPUTE-001 | The system SHALL let a driver or a host raise a dispute on a booking in `active` or `completed`, within the dispute window. | MUST | GIVEN a booking completed 12 hours ago and a 48 hour window WHEN the driver raises a dispute THEN the booking moves to `disputed` and a dispute record is created. |
| FR-DISPUTE-002 | The system SHALL accept evidence uploads on a dispute, stored in a private bucket readable only by the parties, `admin` and `support`. | MUST | GIVEN a driver uploading a photograph as evidence WHEN an unrelated signed in user requests its URL THEN access is denied. |
| FR-DISPUTE-003 | The system SHALL hold the host payout for any disputed booking until resolution. | MUST | GIVEN a disputed booking WHEN the payout batch runs THEN its amount is excluded from the host's available balance. |
| FR-DISPUTE-004 | The system SHALL let an `admin` or `support` user resolve a dispute with an outcome, a resolution amount and a written rationale. | MUST | GIVEN a dispute resolved in the driver's favour for Rs 150 WHEN resolution is submitted THEN a partial refund of 15000 paise is issued, the rationale is stored, and both parties are notified. |
| FR-DISPUTE-005 | The system SHALL return a resolved booking to `completed` and SHALL release any held payout adjusted by the resolution amount. | MUST | GIVEN a dispute resolved with a Rs 150 refund on a Rs 200 net payout WHEN resolution completes THEN the booking is `completed` and the host's available balance increases by the adjusted amount. |
| FR-DISPUTE-006 | The system SHALL prevent a second dispute on the same booking once one has been resolved, unless an admin reopens it. | MUST | GIVEN a resolved dispute WHEN the driver raises another on the same booking THEN it is refused with `DISPUTE_ALREADY_RESOLVED`, and WHEN an admin reopens it THEN a new round of evidence is accepted. |

---

## AUDIT: audit trail

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-AUDIT-001 | The system SHALL write an append-only audit entry for every state-changing action by an `admin`, `support` or `operator` user, recording actor, action, entity, before value, after value and timestamp. | MUST | GIVEN an admin changing a platform setting WHEN the change commits THEN one audit row exists carrying all six fields. |
| FR-AUDIT-002 | The system SHALL prevent update and delete on audit rows for every role including `admin`. | MUST | GIVEN an admin session WHEN it attempts to delete an audit row THEN the operation is refused at the database layer. |
| FR-AUDIT-003 | The system SHALL audit every booking state transition, including automatic transitions made by scheduled jobs, naming the system actor where no human acted. | MUST | GIVEN a hold expiring through the scheduled job WHEN the transition commits THEN an audit row records actor `system:hold-expiry` and the transition from `pending` to `expired`. |
| FR-AUDIT-004 | The system SHALL make the audit log queryable by actor, entity type, entity identifier and time range. | MUST | GIVEN 90 days of audit data WHEN an admin filters by one booking identifier THEN every entry for that booking is returned in chronological order. |

---

## SEO: local search optimisation

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-SEO-001 | The system SHALL server render one indexable page per launch neighbourhood and one per supported landmark, each with unique title, description and body content. | MUST | GIVEN the Park Street neighbourhood page WHEN it is fetched without JavaScript THEN the listing summaries, the neighbourhood copy and a unique title tag are present in the HTML. |
| FR-SEO-002 | The system SHALL emit valid structured data for the marketplace and for each listing, without including the exact address on a public page. | MUST | GIVEN a listing detail page WHEN its structured data is parsed THEN it validates and contains the locality but not the street-level exact address. |
| FR-SEO-003 | The system SHALL generate a sitemap covering every published listing, neighbourhood page and landmark page, and SHALL exclude unpublished and rejected listings. | MUST | GIVEN one unpublished listing and 40 published listings WHEN the sitemap is fetched THEN it contains 40 listing URLs and not the unpublished one. |
| FR-SEO-004 | The system SHALL return a canonical URL on every public page and SHALL set `noindex` on search result pages carrying query parameters. | SHOULD | GIVEN `/search?q=park+street` WHEN the page is served THEN it carries a `noindex` directive, and GIVEN `/parking/kolkata/park-street` THEN it is indexable with a self-referencing canonical. |

---

## SUPPORT: support tooling

| ID | Requirement | Priority | Acceptance |
| --- | --- | --- | --- |
| FR-SUPPORT-001 | The system SHALL grant `support` read access to all user, listing, booking and payment records, and write access only to dispute records and support messages. | MUST | GIVEN a `support` session WHEN it attempts to change a platform setting THEN the write is refused, and WHEN it resolves a dispute THEN the write succeeds. |
| FR-SUPPORT-002 | The system SHALL let `support` view a booking timeline showing every state transition, payment event, notification and message in chronological order. | MUST | GIVEN a booking with 9 recorded events WHEN the timeline opens THEN all 9 are shown in order with timestamps and actors. |
| FR-SUPPORT-003 | The system SHALL permit read-only impersonation of a user by `admin` or `support`, and SHALL record every impersonation session in the audit log with a mandatory reason. | MUST | GIVEN a support user beginning impersonation WHEN the session starts THEN an audit entry names the support user, the impersonated user and the reason, and every write attempt during the session is refused. |
| FR-SUPPORT-004 | The system SHALL expose an internal health and reconciliation view showing expired holds released, webhooks pending retry, payments unmatched and jobs overdue. | MUST | GIVEN one unmatched payment WHEN the view loads THEN it appears with its provider reference, its age and a link to the affected booking. |

---

## Edge case coverage index

The scenarios named in the brief map to these requirements. Every one is covered.

| Edge case | Covered by |
| --- | --- |
| Two drivers book the same slot concurrently | FR-BOOKING-001, FR-BOOKING-002 |
| Payment succeeded but booking failed | FR-PAYMENT-007, FR-PAYMENT-008, FR-HOLD-004 |
| Webhook arrives twice | FR-PAYMENT-006, FR-NOTIFY-003 |
| Webhook arrives late or out of order | FR-PAYMENT-007, FR-PAYMENT-008 |
| Driver never arrives | FR-BOOKING-007, FR-ACCESS-004 |
| Driver overstays | FR-ACCESS-008, FR-ACCESS-009 |
| Host cancels after payment | FR-CANCEL-006, FR-REFUND-002 |
| User double-clicks pay | FR-PAYMENT-003 |
| Hold expires during payment | FR-HOLD-004, FR-PAYMENT-007 |
| Coupon exhausted between quote and capture | FR-COUPON-002, FR-COUPON-003 |
| Wallet debited twice concurrently | FR-WALLET-005 |
| Host suspended with bookings outstanding | FR-HOSTONB-006, FR-ADMIN-004 |
| Listing unpublished with future bookings | FR-LISTING-008 |
| Extension would collide with the next booking | FR-BOOKING-009 |
| Settings changed mid-checkout | FR-QUOTE-005, FR-ADMIN-002 |
| Exact location requested too early or by the wrong user | FR-ACCESS-002, FR-ACCESS-003, FR-SEARCH-005 |
