# 18. Security Requirements

> **Status: engineering-ready draft for review.** This document states the security
> requirements the ParkSpace build must satisfy. It is a specification, not a
> certification, not an audit report and not a statement that the platform is secure
> today. Nothing here is legal advice. Items marked **REVIEW REQUIRED** need a decision
> from a qualified professional, in most cases an Indian advocate, a chartered
> accountant or an external security assessor, before launch.

Derived from `00_SPEC_KERNEL.md`. Where this document and the spec kernel differ, the
spec kernel wins.

---

## 1. Scope and security objectives

ParkSpace is a two-sided marketplace on Next.js 15 (Vercel), Supabase Postgres,
Supabase Auth and Supabase Storage, with payments behind a provider abstraction that
has a zero-config mock adapter and a Razorpay adapter. The security perimeter is
therefore: the browser, the Vercel edge and serverless runtime, the Supabase project
(Postgres, Auth, Storage, Realtime), the payment provider, and the small set of free
third party services the kernel names (OpenStreetMap tiles, Nominatim geocoding, OSRM
directions), each of which is proxied server side.

The objectives, in priority order:

1. **Integrity of the reservation ledger.** A confirmed booking is a hard reservation.
   The GiST exclusion constraint in section 6 of the spec kernel is a security control
   as much as a correctness control, because a bypass of it is a denial of service
   against paying drivers and a fraud vector against hosts.
2. **Integrity of money.** Amounts are integer paise in `bigint`. No client input may
   ever set a price, a fee, a commission or a payout. Every amount is recomputed server
   side from `platform_settings` and the listing record.
3. **Confidentiality of exact location.** Section 10 of the spec kernel is the single
   most sensitive data rule in the product. Exact coordinates, full address, gate number
   and access instructions are released only to a driver with a confirmed booking, and
   only from 24 hours before start.
4. **Confidentiality of identity and payout data.** Verification documents and bank or
   UPI payout details are the highest impact records in the database.
5. **Availability of the booking loop.** Search, quote, hold, pay, confirm, check in.

---

## 2. Assets

| Asset | Where it lives | Impact if lost or exposed |
| --- | --- | --- |
| Session tokens (Supabase Auth JWT, refresh token) | Browser cookie storage, server request context | Full account takeover, including host payout changes |
| Payment references (provider order id, payment id, signature, refund id) | `payments`, `refunds` tables, provider dashboard | Reconciliation fraud, replayed capture, disputed chargebacks |
| Exact addresses and coordinates | `spaces.lat`, `spaces.lng`, `spaces.address_line1/2` | Physical risk to hosts, stalking, targeted burglary, competitor scraping of supply |
| Access instructions and gate codes | `spaces.access_instructions`, `spaces.gate_number` | Unauthorised physical entry to a private property |
| Verification documents (identity, address, ownership or authority proof) | Supabase Storage private bucket, `verifications` table | Identity theft, DPDP-significant breach, host attrition |
| Payout details (bank account, IFSC, UPI VPA, PAN where collected) | `payout_methods` table, provider vault | Direct financial theft, tax exposure |
| Vehicle registration numbers | `vehicles` table | Owner tracing, location history inference |
| Message threads and dispute evidence | `messages`, `disputes`, evidence bucket | Harassment, leverage in disputes, privacy harm |
| Audit log | `audit_log` table | Loss of the ability to prove what happened, which destroys dispute resolution |
| Service-role key and provider secrets | Vercel environment variables only | Total compromise of every asset above |

---

## 3. Threat model (STRIDE)

### 3.1 Spoofing

| Threat | Vector | Mitigation |
| --- | --- | --- |
| Account takeover by OTP interception or reuse | Email OTP replayed, or OTP brute forced | Short OTP lifetime, single use, attempt counter per identifier, per-IP and per-identifier rate limiting, account lockout with exponential backoff |
| Credential stuffing on password login | Reused passwords from third party breaches | Rate limit per identifier and per IP, minimum password length 10, block known-breached passwords where a free offline list is feasible, mandatory re-authentication before payout method change |
| Session token theft | XSS, malicious dependency, shared device | HttpOnly SameSite cookies, short access token lifetime with refresh rotation, strict Content Security Policy, session list and global sign-out in account settings |
| Impersonating the payment provider | Forged webhook to mark a booking paid | HMAC signature verification on every webhook before any parsing of the body, plus idempotency keys, see section 4.6 |
| Host impersonating a property owner | Listing a space the person does not control | Authority-to-list warranty plus verification workflow, see `21_Host_Terms.md` clause 3 and section 6.2 below |

### 3.2 Tampering

| Threat | Vector | Mitigation |
| --- | --- | --- |
| Price or fee manipulation | Client posts `total_amount`, `service_fee` or `host_payout` | Server recomputes every amount from `platform_settings` and the listing. The quote is server-issued, signed and short lived. The booking request references a quote id, never an amount |
| Booking state machine manipulation | Client posts `status = 'completed'` to trigger payout | State transitions enforced by a database trigger, per spec kernel section 9, not only in application code |
| Overlapping booking injection | Direct PostgREST call bypassing the API route | GiST exclusion constraint at the database level, plus RLS insert policy that forbids a driver from writing `status`, `host_payout` or `bay_index` directly |
| Review manipulation | Editing a review after it is published, or writing a review without a completed booking | Reviews insertable only where a `completed` booking exists for that `(user, space)` pair, edit window closed after publication, immutable audit row |
| Tampering with stored evidence | Replacing a dispute photo after submission | Evidence objects write-once by policy, content hash recorded in `disputes`, no update path for the uploader after submission |

### 3.3 Repudiation

| Threat | Mitigation |
| --- | --- |
| Host denies accepting a booking | Append-only `audit_log` with actor id, actor role, action, entity, before and after state, request id, IP and user agent |
| Driver denies checking in | Check-in event records timestamp, server-side geodistance result, QR token id and device metadata |
| Admin denies issuing a refund | Every admin action writes an audit row. Admin actions on money require a reason string. Audit rows are insert-only at the RLS layer and have no update or delete policy for any role |

### 3.4 Information disclosure

| Threat | Mitigation |
| --- | --- |
| Exact location leaked before confirmation | The public view exposes only `approx_lat` and `approx_lng`, jittered 80 to 150 metres by a deterministic vector, plus street and locality. Enforced by RLS and by a dedicated public view that does not contain the exact columns at all |
| Bulk scraping of supply | Rate limiting on search, no unbounded page size, no ordering parameter that permits full enumeration, bot detection on the search endpoint |
| Verification documents readable by another user | Private Storage bucket, no public URL, access only through short-lived signed URLs minted server side after an authorisation check |
| Payout details visible to support staff | Payout details masked to last four characters for `support`, full value visible to no role in the UI, decryption only in the payout job |
| Error messages disclosing internals | Generic error envelope to the client with a correlation id, full detail only in server logs |
| Personal data in logs | Structured logging with a deny-list of field names, see section 4.10 |

### 3.5 Denial of service

| Threat | Mitigation |
| --- | --- |
| Hold exhaustion, an attacker places pending holds on all bays | `BOOKING_HOLD_MINUTES` default 10, per-account concurrent hold cap, per-account and per-IP hold creation rate limit, escalating friction after repeated expiries, reputation flag on repeated hold abandonment |
| Geocoding and tile quota exhaustion | Nominatim proxied server side with caching and a one request per second policy, tiles fetched by the client from the public endpoint with a compliant referrer, circuit breaker on upstream failure |
| Expensive search queries | Bounded bbox, mandatory radius cap, indexed geospatial query, statement timeout |
| Webhook flood | Signature check before parse, cheap rejection path, provider IP allow-list where the provider publishes one, **REVIEW REQUIRED** on whether Razorpay publishes a stable IP range |

### 3.6 Elevation of privilege

| Threat | Mitigation |
| --- | --- |
| Driver reads or writes host data | RLS policies keyed on `auth.uid()` and on the `profiles.roles` array, with deny-by-default on every table |
| Role self-escalation | `profiles.role` and `profiles.roles` are not updatable by the owning user for privileged values. Adding `host` runs through onboarding. Adding `admin`, `support` or `operator` is possible only through a service-role path with an audit row |
| Service-role key reaching the browser | Section 4.3. This is a build-breaking rule, not a guideline |
| Operator staff seat exceeding its scope | Staff seats scoped to specific `space_id` values, gate control limited to spaces in scope, no earnings or payout visibility unless explicitly granted |

---

## 4. Controls

### 4.1 Authentication and session handling

1. Supabase Auth with email OTP plus password, per the spec kernel.
2. Access tokens short lived, refresh tokens rotated on use, reuse of a rotated refresh
   token invalidates the family and forces re-authentication.
3. Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` for the session, `SameSite=Strict`
   for anything that mutates money.
4. Step-up authentication required for: changing email, changing password, adding or
   changing a payout method, initiating a withdrawal, and deleting the account.
5. Password minimum length 10, no composition rules, no forced rotation.
6. Account enumeration resistance: identical response shape and timing for known and
   unknown identifiers on sign-in and password reset.
7. Admin and support accounts must have a second factor. **REVIEW REQUIRED** on whether
   the chosen Supabase plan supports enforced MFA for a role subset, and what the
   fallback is if it does not.
8. Sessions listed in account settings with device, approximate location and last seen,
   with a revoke control and a revoke-all control.

### 4.2 Authorisation: Row Level Security is the boundary

1. **No security decision may live only in the user interface.** Hiding a button is a
   usability choice. If the only thing preventing an action is that the button is
   hidden, the control does not exist.
2. Every table has RLS enabled and a deny-by-default posture. A table without an
   explicit policy is unreadable and unwritable by the `anon` and `authenticated` roles.
3. Policies are written against `auth.uid()` and the role set, never against a value
   supplied in the request body.
4. Column level protection: sensitive columns are excluded from the public views that
   the client queries. The exact location columns are not merely filtered, they are
   absent from the public projection.
5. Every RLS policy has a test. The test suite must include, for each policy, one
   positive case and at least one negative case executed as a different user.
6. API routes repeat the authorisation check as defence in depth, but the database is
   the authority. If an API route and a policy disagree, the policy is correct and the
   route is a bug.
7. Views used by the client are `security_invoker` where supported, so that RLS on the
   underlying tables is not silently bypassed.

### 4.3 The service-role key rule

1. The Supabase service-role key bypasses RLS entirely. It is a root credential.
2. It may exist only in server-side environment variables on Vercel. It must never
   appear in any file that the bundler can reach from client code, never in a
   `NEXT_PUBLIC_` variable, never in a React component, never in an edge middleware that
   returns data to the browser without an authorisation check.
3. A CI check must fail the build if the service-role variable name appears in any
   client bundle output or in any file under a client-component boundary.
4. Server code that uses the service-role key must be confined to a small, reviewed set
   of modules: the payments webhook handler, the scheduled jobs (hold expiry, payout
   batch, overstay sweep), the admin actions layer, and the verification pipeline.
   Every such module performs its own authorisation check first.
5. Rotation procedure documented in section 4.9.

### 4.4 Input validation

1. Zod schemas at every trust boundary: HTTP request bodies, query strings, route
   params, webhook payloads after signature verification, environment variables at
   boot, and the responses of third party services before use.
2. Parse, do not cast. `schema.parse` produces the typed value used downstream. A raw
   `any` from a request must never reach a query.
3. Strict schemas: unknown keys rejected, not stripped, on anything that mutates state.
4. Server-side normalisation of all free text before storage, and output encoding at
   render. No raw HTML from user input is ever rendered. Markdown from users, if
   permitted at all, is rendered through a sanitiser with an allow-list.
5. File uploads: validated by magic bytes and not by extension or client MIME type,
   size capped per bucket, images re-encoded server side to strip EXIF. Stripping EXIF
   is a location privacy control, because a host photo can carry the exact GPS fix that
   section 10 of the spec kernel is designed to withhold.
6. Identifiers accepted only as UUIDs. No sequential integer surrogate keys in URLs for
   any object that carries personal data.

### 4.5 Rate limiting per endpoint class

| Class | Example | Limit (initial values, tunable in `platform_settings`) |
| --- | --- | --- |
| Auth: OTP request | `POST /api/auth/otp` | 3 per identifier per 15 minutes, 10 per IP per hour |
| Auth: sign-in attempt | `POST /api/auth/signin` | 10 per identifier per hour, exponential backoff |
| Search and read | `GET /api/search` | 60 per minute per IP, 120 per minute per authenticated user |
| Quote | `POST /api/quote` | 30 per minute per user |
| Hold or booking creation | `POST /api/bookings` | 5 per minute per user, 3 concurrent open holds per user |
| Payment initiation | `POST /api/payments/intent` | 10 per hour per user |
| Messaging | `POST /api/messages` | 20 per minute per user |
| Upload | `POST /api/uploads` | 20 per hour per user |
| Webhook | `POST /api/webhooks/:provider` | 600 per minute per provider, cheap rejection before parse |
| Admin write | admin actions | 120 per minute per admin, every action audited |

Limits are enforced server side with a shared store so that they hold across serverless
instances. Exceeding a limit returns `429` with `Retry-After` and writes a security
event. Repeated `429` from one account raises a review flag.

### 4.6 Webhooks: signature verification and replay protection

1. Read the raw request body. Verify the provider HMAC signature against the raw bytes
   before any JSON parsing. Reject with `400` on mismatch and log a security event.
2. Reject events whose timestamp is outside a tolerance window, default 5 minutes, to
   limit replay.
3. Every webhook event carries a provider event id. Insert that id into a
   `webhook_events` table with a unique constraint before processing. A duplicate insert
   means the event was already handled: acknowledge with `200` and stop. This makes
   handling idempotent even under provider retry storms.
4. All state changes driven by a webhook run inside one transaction with the
   `webhook_events` insert, so a partial application is impossible.
5. Never trust amounts from the webhook body alone. Re-fetch or re-verify the payment
   against the stored order record and compare the expected `total_amount` in paise. A
   mismatch parks the booking in a manual review state rather than confirming it.
6. The mock payment adapter must implement the same signature and idempotency contract,
   so that the security path is exercised in development and not only in production.
7. Webhook endpoints are the only routes exempt from the standard auth middleware.
   That exemption must be explicit and narrow in the middleware matcher.

### 4.7 Storage bucket policies

| Bucket | Visibility | Policy |
| --- | --- | --- |
| `space-photos` | Public read of derived, watermark-free but EXIF-stripped renditions | Write only by the owning host for spaces they own. Originals not public |
| `verification-docs` | Private | No public read. Read only by `admin` through a signed URL minted server side, maximum lifetime 5 minutes, with an audit row per mint |
| `dispute-evidence` | Private | Read by the two parties to that dispute and by `admin` and `support`. Write-once. Signed URLs, 5 minute lifetime |
| `avatars` | Public read | Write only by the owning user, size and type capped |

Path convention binds the object to the owner, for example
`verification-docs/{user_id}/{document_id}`, and the Storage policy asserts that the
first path segment equals `auth.uid()`. Bucket policies are tested in the same suite as
RLS policies.

### 4.8 Secret management

1. Secrets live in Vercel environment variables, scoped per environment, and in the
   Supabase project settings. Secrets are never committed. `.env.local` is gitignored
   and a pre-commit secret scanner runs on every commit.
2. The environment schema is validated with Zod at boot. A missing or malformed secret
   fails the boot loudly rather than degrading silently.
3. Separate Supabase projects and separate payment provider keys for development,
   preview and production. Preview deployments must never point at production data.
4. Rotation: scheduled every 180 days, and immediately on suspicion, on staff departure
   with access, or on any incident of severity S2 or above.

### 4.9 Rotation runbook

1. Mint the new secret in the provider console.
2. Add it as a second accepted value where the provider supports overlap, otherwise
   schedule a short maintenance window on the affected job only.
3. Deploy the new value to Vercel, verify with a synthetic transaction, then revoke the
   old value.
4. Record the rotation in the audit log with the actor and reason.
5. For the service-role key specifically, rotation invalidates every background job.
   The runbook must list every job that holds it: hold expiry, overstay sweep, payout
   batch, notification dispatch, verification pipeline, analytics rollup.

### 4.10 Logging and audit

1. Two separate streams. **Application logs** are operational and short lived, 30 days.
   **The audit log** is a Postgres table, append-only, and retained per
   `19_Privacy_Requirements.md`.
2. Audit rows are mandatory for: authentication events, role changes, listing creation
   and edit, verification decision, booking state transitions, all money movements,
   refund issuance, payout method change, withdrawal, admin override of any kind,
   release of exact location to a driver, and signed URL minting for private buckets.
3. Every audit row carries: `actor_id`, `actor_role`, `action`, `entity_type`,
   `entity_id`, `before`, `after`, `request_id`, `ip`, `user_agent`, `created_at`.
4. Logs must not contain: passwords, OTPs, tokens, full payout account numbers, full
   document numbers, exact coordinates of unconfirmed listings, or message bodies. A
   field deny-list is enforced in the logger, not left to the caller.
5. Alerting on: repeated failed logins for one account, a spike in `429`, webhook
   signature failures, exclusion-constraint violations above baseline, refund volume
   above a threshold, and any service-role usage outside the approved module list.

### 4.11 Dependency and supply chain

1. Pin dependencies with a committed lockfile. No floating major versions.
2. Automated vulnerability scanning on every pull request. Build fails on a known
   critical or high advisory in a production dependency path.
3. A new runtime dependency requires a reviewer sign-off note covering: what it does,
   why a standard library approach is insufficient, its maintenance signal, and its
   transitive footprint.
4. No third party script tags on any page that carries personal data or payment state.
   The payment provider checkout script is the sole exception and is loaded with
   Subresource Integrity where the provider supports it. **REVIEW REQUIRED** on whether
   Razorpay publishes a stable SRI hash for its checkout bundle.
5. Content Security Policy with an explicit allow-list, no `unsafe-inline` for scripts,
   nonce-based where inline is unavoidable. Additional headers:
   `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying
   camera and microphone except where check-in QR scanning needs the camera, and a
   restrictive `frame-ancestors`.
6. GitHub branch protection: no direct pushes to the default branch, at least one
   review, status checks required, and secrets scanning enabled.

---

## 5. Incident response

### 5.1 Severity levels

| Severity | Definition | Acknowledge | Contain | User and regulator notice |
| --- | --- | --- | --- | --- |
| S1 | Confirmed exposure of personal data, payout data or verification documents, or confirmed unauthorised money movement | 30 minutes | 4 hours | Begin notice assessment immediately, see 5.3 |
| S2 | Credible compromise of a credential or a component, no confirmed data exposure yet | 1 hour | 12 hours | Assess |
| S3 | Exploitable vulnerability found, no evidence of exploitation | 1 business day | 7 days | Not applicable unless reclassified |
| S4 | Low impact issue, hardening gap, informational finding | 3 business days | Next release | Not applicable |

### 5.2 Runbook

1. **Declare.** Any engineer may declare an incident. Over-declaring is free,
   under-declaring is not.
2. **Assign** an incident lead and a scribe. The lead does not fix, the lead coordinates.
3. **Contain.** Revoke sessions, rotate the affected secret, disable the affected route
   with a feature flag, suspend the affected account. Containment precedes diagnosis.
4. **Preserve evidence.** Snapshot logs and the relevant audit rows before any cleanup.
   Do not delete attacker artefacts.
5. **Assess scope.** Which records, which users, which time window, what data classes.
   The audit log is the primary instrument here, which is why it is append-only.
6. **Eradicate and recover.** Patch, redeploy, verify with a targeted test.
7. **Notify.** See 5.3.
8. **Post-incident review** within 5 business days, blameless, with dated corrective
   actions each having an owner.

### 5.3 Notification

**REVIEW REQUIRED:** the personal data breach notification obligation, its trigger, its
timeline, its content and the recipient authority depend on the Digital Personal Data
Protection Act 2023 and on rules made under it, some of which may not be notified or
fully in force at the time of writing. CERT-In directions may impose a separate and
faster reporting obligation for certain cyber incidents, and the applicability of those
directions to this platform depends on the entity's classification. Both questions must
be answered by an Indian advocate before launch, and the answers written into this
section as concrete hours and a named recipient. Until then, the engineering default is:
treat an S1 as notifiable, prepare the notice content within 6 hours, and do not publish
or send any notice without counsel review.

Draft notice content should cover: what happened, when, what data classes were involved,
how many data principals, what the platform has done, what the user should do, and a
named contact.

---

## 6. Marketplace fraud

Marketplace fraud is not a conventional application security problem. The attacker is
often an authenticated, verified user who is abusing a feature that is working exactly
as designed. Detection is therefore signal-based and largely asynchronous, and the
enforcement path is the account lifecycle in `21_Host_Terms.md` and
`22_Driver_Terms.md`, not a `403`.

### 6.1 Fake listings

A listing for a space that does not exist, or photographs taken from another site.

Detection signals: reverse-image similarity against existing listings and against a
scraped-image corpus; a geocode that falls on a water body, a carriageway, a railway
line or a plot with no vehicular access; a new host account listing more than two spaces
within the first 24 hours; a listing price far below the locality median; no
verification document uploaded after a reminder; a first booking that results in an
immediate access-failure dispute. Response: hold the listing in `pending_review`, block
payout on the first booking until check-out completes cleanly.

### 6.2 Listing a space the host does not control

The most consequential fraud in this product, because the injured party is a third
party who never used the platform: a real owner, a housing society, or a commercial
landlord. The contractual control is the authority-to-list warranty. The technical
controls are supporting.

Detection signals: address collision with an existing verified listing owned by a
different account; a residential address in a multi-dwelling building without a society
no-objection document; mismatch between the name on the identity document and the name
on the ownership or tenancy proof; a complaint received through the grievance channel
from a non-user; repeated hosting of spaces across distant localities under one
individual account; an access instruction that references a shared or common area.
Response: immediate suspension of the listing on a credible third party complaint,
refund of affected bookings under `23_Refund_Policy.md`, and no payout release pending
resolution. See `20_Legal_Requirements.md` on society bye-laws, land use and occupancy
certificates.

### 6.3 Fake bookings for review inflation

A host books their own space, or arranges bookings from associated accounts, to
manufacture completed-booking count and five star reviews.

Detection signals: device fingerprint, IP subnet or payment instrument shared between
host and driver accounts; bookings of the minimum duration repeated at an unusual
cadence; a driver account whose entire history is at one host; check-in and check-out
events separated by under `MIN_BOOKING_MINUTES` plus a small delta; a refund pattern
where money returns to the same instrument; review text similarity across accounts;
account creation timestamps clustered within minutes. Response: suppress the affected
reviews from the aggregate, do not necessarily delete them, flag the host for manual
review, and withhold referral or promotional credit.

### 6.4 Payment fraud

Stolen card use, chargeback abuse, refund abuse, and the classic marketplace cash-out
where a fraudster pays with a stolen instrument into a host account they control.

Detection signals: high-value first booking on a new account; mismatch between billing
geography and booking locality; multiple distinct payment instruments on one account
within a short window; velocity of failed authorisations; booking then immediate
cancellation under a `flexible` policy with a request to refund to a different
instrument; a host account created shortly before a large inbound booking; withdrawal
requested immediately after a booking completes. Response: refunds always return to the
original instrument and never to an alternative destination, that is a hard rule; a
payout holdback window on new host accounts; manual review above a value threshold;
never confirm a booking on a client-side payment success callback alone, only on a
verified webhook, see 4.6.

### 6.5 GPS spoofing at check-in

A driver, or a colluding host, reports a check-in from a device with a falsified
location, to claim a completed booking, defeat a no-show, or manufacture evidence in a
dispute.

Detection signals: reported accuracy radius implausibly small or implausibly constant;
coordinates identical to the listing to more decimal places than a real fix produces;
impossible travel between two consecutive events by the same account; platform-reported
mock-location flag where the browser exposes it; a check-in timestamp that precedes any
plausible approach given the previous known position; QR token scanned from a screenshot
rather than presented in person. Response: the QR check-in token is short lived, single
use and bound to the booking, and geolocation is one signal among several rather than
the sole proof. A geofence failure should downgrade confidence and route to host
confirmation, not hard-block a legitimate driver standing in a basement with no fix.

### 6.6 Collusion between a host and a driver

Two cooperating accounts extracting value from the platform: manufacturing referral or
coupon credit, cycling money for cash-out, generating disputes to trigger refunds while
the host keeps the payout, or inflating completed parking hours to win a supply
incentive.

Detection signals: graph analysis over the booking bipartite graph, looking for pairs
with abnormally high mutual exclusivity; shared device, IP, payout instrument or
recovery email; coupon redemption concentrated on one host; referral chains that close
into a cycle; disputes that are always resolved in the same direction; earnings that
spike exactly at an incentive threshold. Response: incentive clawback terms in the host
agreement, manual review of any incentive payout above a threshold, and a documented
admin action with reasons recorded in the audit log.

**REVIEW REQUIRED:** automated suspension and any automated scoring that materially
affects a user has legal exposure under consumer protection rules and, where profiling
is involved, under data protection principles. Counsel must confirm what may be
automated, what requires human review, and what must be disclosed to the affected user.

---

## 7. Pre-launch security checklist

Every item must be ticked, with an owner and a date, before any real money moves.

- [ ] RLS enabled on every table, deny-by-default verified by an automated test that
      enumerates `information_schema` and fails on any table without a policy
- [ ] Positive and negative RLS test for every policy, run in CI
- [ ] The exact-location rule verified by test: an unconfirmed driver cannot obtain
      exact coordinates, full address, gate number or access instructions through any
      route, view, RPC or Storage object
- [ ] Confirmed-booking release verified: exact location appears only from 24 hours
      before start
- [ ] Service-role key absent from every client bundle, enforced by a CI grep
- [ ] Zod validation at every route handler, verified by a route inventory checklist
- [ ] Rate limits configured per endpoint class and verified by a load test
- [ ] Webhook signature verification and idempotency verified with a replayed event
- [ ] Amounts recomputed server side, verified by a test that posts a tampered amount
- [ ] Booking state transition trigger verified by a test that attempts an illegal jump
- [ ] Exclusion constraint verified by a concurrency test issuing simultaneous
      overlapping bookings
- [ ] Storage bucket policies tested, including cross-user read attempts
- [ ] EXIF stripped from every uploaded image, verified on a photo with GPS metadata
- [ ] Security headers and CSP verified by an external header scan
- [ ] Secrets rotated from any value that appeared in a shared channel during
      development
- [ ] Dependency scan clean of critical and high advisories
- [ ] Audit log write verified for every action listed in 4.10.2
- [ ] Admin and support accounts have second factor enabled
- [ ] Incident runbook rehearsed once, including a secret rotation drill
- [ ] Backup restore rehearsed once, with a recorded recovery time
- [ ] Grievance and security contact addresses live and monitored, see
      `20_Legal_Requirements.md`
- [ ] Privacy notice published and consistent with `19_Privacy_Requirements.md`
- [ ] Penetration test by an independent assessor, findings triaged, all critical and
      high closed. **REVIEW REQUIRED** on whether any sectoral rule mandates a specific
      assessment or empanelled auditor for this platform

---

## 8. Non-negotiables

1. No security decision lives only in the user interface.
2. The service-role key never reaches the browser.
3. Money is recomputed server side, always.
4. A booking is confirmed by a verified webhook, never by a client callback.
5. Exact location is released by Row Level Security, not by a conditional render.
6. The audit log is append-only and has no delete path for any role.
7. Refunds return to the original payment instrument only.
