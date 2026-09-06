# 19. Privacy Requirements

> **Status: engineering-ready draft for review by qualified Indian counsel.** This
> document states the privacy requirements the ParkSpace build must satisfy. It is not
> legal advice, it has not been settled by an advocate, and it must not be treated as a
> compliance opinion. The Digital Personal Data Protection Act 2023 is treated here as
> the governing framework, but several of its operative obligations depend on rules
> that may not be notified or fully in force at the time of writing. Every point that
> turns on such a rule is marked **REVIEW REQUIRED**.

Derived from `00_SPEC_KERNEL.md`. The user-facing expression of these requirements is
`24_Privacy_Policy.md`. Where the two differ, this document states the engineering
obligation and the policy must be corrected to match.

---

## 1. Terminology

The platform operator, `[COMPANY LEGAL NAME]`, is the **Data Fiduciary** for the
personal data of drivers and hosts. Users are **Data Principals**. Vendors that process
personal data on the platform's instructions are **Data Processors**. These are the DPDP
Act terms and are used throughout in preference to the GDPR equivalents.

**REVIEW REQUIRED:** whether `[COMPANY LEGAL NAME]` meets any threshold for
classification as a Significant Data Fiduciary. That classification, if it applies,
adds obligations including a Data Protection Officer based in India, an independent data
auditor and periodic data protection impact assessments. The thresholds depend on
notification and on the volume and sensitivity of processing. Counsel must answer this
before launch and the answer must be written into section 11.

---

## 2. Data inventory

Legal basis column: the DPDP Act operates principally on **consent** and on **certain
legitimate uses**. The entries below record the intended basis. **REVIEW REQUIRED** on
every row marked with an asterisk, because whether the processing sits inside a
legitimate use or requires express consent is a determination for counsel, not for
engineering.

| Data element | Purpose | Intended lawful basis | Retention | Where it lives |
| --- | --- | --- | --- | --- |
| Email address | Account identity, OTP delivery, transactional notice | Consent, and performance of the requested service* | Life of account, then 90 days | `auth.users`, Supabase Auth |
| Password hash | Authentication | Consent* | Life of account | `auth.users`, Supabase Auth |
| Mobile number | Booking notice, host and driver contact at the time of a booking | Consent | Life of account, then 90 days | `profiles` |
| Display name and avatar | Trust signal between the two sides of the marketplace | Consent | Life of account | `profiles`, `avatars` bucket |
| Role and role set | Authorisation | Consent* | Life of account | `profiles.role`, `profiles.roles` |
| Vehicle registration number, make, model, colour | Identifying the vehicle to the host at check-in, dispute resolution | Consent | Life of account, then 90 days; retained on completed bookings per the financial rule in section 8 | `vehicles`, `bookings` |
| Space exact address and coordinates | Enabling a confirmed driver to reach the space | Consent (host) | Life of listing plus 1 year | `spaces` |
| Space approximate coordinates | Public search and map | Consent (host) | Life of listing plus 1 year | `spaces.approx_lat`, `spaces.approx_lng` |
| Access instructions and gate number | Physical access by a confirmed driver | Consent (host) | Life of listing | `spaces` |
| Space photographs | Listing presentation | Consent (host) | Life of listing plus 1 year | `space-photos` bucket |
| Host verification documents (identity, address, ownership or authority proof) | Fraud prevention, the authority-to-list check, trust | Consent, and prevention of fraud* | **REVIEW REQUIRED**, see section 8. Engineering default: 1 year after the host account closes | `verification-docs` bucket, `verifications` |
| Payout details (bank account, IFSC, UPI VPA) | Paying the host | Consent, and performance | Per the financial record rule, see section 8 | `payout_methods`, provider vault |
| PAN, where collected | Tax withholding and reporting | **REVIEW REQUIRED**, depends on the TDS position in `20_Legal_Requirements.md` | Per the financial record rule | `payout_methods` |
| Payment references (order id, payment id, refund id, masked instrument) | Reconciliation, refunds, chargeback defence | Performance, and legal obligation* | Per the financial record rule | `payments`, `refunds` |
| Booking records (times, amounts, space, status) | Delivery of the service, dispute resolution, accounting | Performance, and legal obligation* | Per the financial record rule | `bookings` |
| Check-in and check-out events, including the geodistance result | Proving attendance, overstay calculation, dispute resolution | Performance* | 3 years from booking end, then reduce to a non-identifying event record | `booking_events` |
| Device location at check-in | Verifying presence at the space | Consent, collected in the moment, not continuous | 90 days as a coordinate, then reduced to a pass or fail flag | `booking_events` |
| Messages between host and driver | Coordination, dispute evidence | Consent, and performance | 2 years from the end of the booking thread | `messages` |
| Reviews and ratings | Marketplace trust | Consent | Indefinite while the listing or account exists, see section 9 | `reviews` |
| Dispute records and evidence | Resolving a dispute, defending a claim | Performance, and establishing a legal claim* | 3 years from closure, or until any related claim is finally resolved | `disputes`, `dispute-evidence` bucket |
| Support correspondence | Handling the request | Consent, and performance | 2 years | Helpdesk processor |
| Audit log rows | Security, non-repudiation, regulatory response | Legal obligation, and security* | 3 years. **REVIEW REQUIRED** on whether any longer statutory period applies | `audit_log` |
| IP address, user agent, request id | Security, rate limiting, abuse detection | Prevention of fraud and security* | 30 days in application logs, 3 years where attached to an audit row | Logs, `audit_log` |
| Cookie and session identifiers | Keeping the user signed in | Necessary for the requested service* | Session lifetime | Browser, Supabase Auth |
| Analytics events | Measuring the north star metric and funnel health | Consent for anything beyond strictly necessary* | 13 months at event grain, then aggregated | Analytics store, see `28_Analytics_Requirements.md` |
| Referral and coupon linkage | Running the programme, detecting collusion | Consent, and prevention of fraud* | 2 years | `referrals`, `coupons` |

---

## 3. Data minimisation rules

1. **Collect at the moment of need, not at sign-up.** A driver signs up with an email
   only. Mobile number is requested at first booking. Vehicle details are requested at
   first booking. Payout details are never requested from a driver.
2. **No field exists without a named purpose in section 2.** Adding a column that holds
   personal data requires a row in that table in the same pull request. A schema
   migration that adds personal data without an inventory entry must fail review.
3. **No document is collected where an attribute will do.** Where the requirement is
   "this person is who they say they are", store the verification outcome and a
   reference, not necessarily the document, once verification is complete. **REVIEW
   REQUIRED** on the minimum document retention a payment aggregator or any KYC
   obligation imposes on the platform, which may override this rule for hosts receiving
   payouts. See `20_Legal_Requirements.md`.
4. **Location is sampled, not tracked.** The platform takes a single device location
   reading at check-in and at check-out. There is no background location collection, no
   continuous tracking, and no location history product. The reading is reduced to a
   pass or fail flag after 90 days.
5. **EXIF is stripped from every uploaded image on ingest.** This is both a security
   control and a minimisation control, because an unstripped host photo defeats the
   location privacy rule in section 4.
6. **Masking by default in interfaces.** Payout account numbers and document numbers
   render masked to every role. Full values are available only to the process that needs
   them, never to a human screen, unless an admin performs an audited reveal with a
   recorded reason.
7. **No personal data in analytics event properties.** Analytics carries pseudonymous
   identifiers and categorical dimensions. No email, no phone, no registration number,
   no coordinate finer than locality.
8. **Free text fields are a minimisation risk.** Message bodies, review text and dispute
   descriptions will contain personal data that the platform did not ask for. The
   retention rules in section 2 apply to them regardless, and the deletion routine must
   cover them.

---

## 4. The location privacy rule as a requirement

Section 10 of the spec kernel, restated as testable requirements:

**LP-1.** The public listing projection must contain `approx_lat` and `approx_lng` only.
The columns holding the exact coordinate, the full address lines, the gate number and
the access instructions must be absent from that projection, not merely filtered in the
client.

**LP-2.** `approx_lat` and `approx_lng` are produced by offsetting the true coordinate
by a deterministic vector whose magnitude is between 80 and 150 metres. Determinism
matters: a jitter recomputed per request would let an attacker average many samples back
to the true point. The offset must be a pure function of the space identifier and a
server-side secret, stable for the life of the listing.

**LP-3.** Street and locality may be shown publicly. House number, building name, flat
or bay identifier and landmark text may not.

**LP-4.** The exact coordinate, full address, gate number and access instructions are
readable only by a user holding a booking on that space in status `confirmed`, `active`,
`completed` or `disputed`, and only from 24 hours before `starts_at`, and by the owning
host, the assigned operator staff seat, and `admin`.

**LP-5.** LP-4 is enforced by a Row Level Security policy on the underlying table. A
conditional render in the user interface is not an implementation of LP-4.

**LP-6.** Every release of exact location to a driver writes an audit row.

**LP-7.** Search, map tiles, geocoding proxy responses, the sitemap, local SEO pages,
structured data markup, notification bodies, email templates and any calendar file the
platform generates must all respect LP-1 through LP-4. A confirmation email sent before
the 24 hour window must not contain the address. This is the most common way the rule
gets broken in practice.

**LP-8.** Uploaded photographs must not carry GPS EXIF, and photographs that visibly
show a house number or a nameplate are a moderation concern flagged to the host at
upload.

**LP-9.** A host may withdraw a listing. Withdrawal must remove the exact record from
public reachability immediately, including from any cache or edge revalidation path.

---

## 5. Data principal rights and how each is served

The DPDP Act gives data principals rights of access, correction, erasure, grievance
redressal and nomination. The platform serves each through a product surface, not only
through an email address, because an email-only path does not scale and cannot be
audited reliably.

| Right | Product surface | Technical implementation | Service level |
| --- | --- | --- | --- |
| Access, including a summary of processing and of recipients | Account, Privacy, Download my data | A background job assembles a machine-readable export from the tables in section 2 for that `user_id`, writes it to the private bucket, and emails a signed URL valid 72 hours. Step-up authentication required before the job is queued | Target 7 days, **REVIEW REQUIRED** on the statutory period once rules are notified |
| Correction and completion | Account, Profile; Vehicle; Listing editors | Direct edit under RLS for self-owned rows. Fields the user cannot self-edit, such as a verified legal name, route to a support ticket with an audit row | Immediate for self-edit, 7 days for assisted |
| Erasure | Account, Privacy, Delete my account | A two-stage routine, see section 8.3. Not an immediate hard delete, because of the financial record conflict | Deletion begins within 7 days, completes per the schedule in 8.3 |
| Portability | Same export as access, in JSON plus CSV | The export must be structured and reusable, not a PDF of screenshots. **REVIEW REQUIRED** on whether a portability right in this form is an obligation or a voluntary commitment under the DPDP framework | With the access export |
| Withdrawal of consent | Account, Privacy, Consent settings | Each non-essential purpose has an independent toggle: marketing email, marketing push, analytics beyond strictly necessary, personalised recommendations. Withdrawal must be as easy as giving consent, one action, no retention offer interstitial that blocks the action. Withdrawal stops future processing for that purpose and triggers deletion of data held only for it | Effective immediately, and reflected in downstream processors within 24 hours |
| Grievance redressal | Footer and Help, Contact the Grievance Officer | Ticket routed to `[GRIEVANCE OFFICER NAME]` at `[GRIEVANCE OFFICER EMAIL]`, tracked with a reference number, escalation ladder in `23_Refund_Policy.md` section 10 | Acknowledge within 48 hours, substantive response target 30 days. **REVIEW REQUIRED** on the statutory maximum |
| Nomination | Account, Privacy, Nominee | Record a nominee who may exercise rights in the event of death or incapacity. **REVIEW REQUIRED** on the required form, proof and process | Not a launch blocker, but must exist before it is claimed in the policy |

Rights requests must themselves be authenticated. A request arriving by email from an
address that matches the account is not sufficient proof on its own for erasure or for
an export containing payout data: require an in-product confirmation.

Every rights request, its outcome and its timing writes an audit row. The platform must
be able to produce, for any user, the full history of what was asked and what was done.

---

## 6. Consent and notice design

1. **Notice precedes consent.** The itemised notice tells the user, in plain language
   and in English, what is collected, for what purpose, and how to exercise rights and
   complain. **REVIEW REQUIRED:** the DPDP Act contemplates notice availability in
   English and in the languages of the Eighth Schedule. For a Kolkata-first launch,
   Bengali and Hindi versions are the realistic minimum, and counsel must confirm what
   is required rather than advisable.
2. **Granular, unbundled, specific.** One consent per purpose. Consent to the service
   is not consent to marketing. Consent to marketing email is not consent to marketing
   SMS.
3. **No pre-ticked boxes, no consent by continued use, no dark patterns.** A decline
   control must be visually equal to an accept control.
4. **Consent is recorded as evidence.** Store the consent artefact: purpose key,
   version of the notice shown, timestamp, and the interface element used. Without the
   notice version, a consent record proves nothing.
5. **Re-consent on material change.** A new purpose requires new consent. A changed
   processor within the same purpose requires updated notice, not necessarily new
   consent. **REVIEW REQUIRED** on where that line falls.
6. **Just-in-time notice** at the three moments that surprise users: the first location
   permission prompt at check-in, the first upload of a verification document, and the
   first release of the host's exact address to a driver. The host must be told at
   listing time, in clear terms, exactly when and to whom the address is released.

---

## 7. Processors and what each receives

| Processor | Role | Personal data received | Location |
| --- | --- | --- | --- |
| Supabase | Database, authentication, storage, realtime | Everything in section 2 that is stored | **REVIEW REQUIRED**, see section 7.1 |
| Vercel | Application hosting, edge, serverless execution, logs | Request data in transit, IP, user agent, and whatever transits the runtime | Global edge, regional functions |
| Razorpay, when enabled | Payment processing and payouts | Name, email, mobile, amount, order reference, payout instrument | India |
| Email delivery provider | Transactional and, separately, marketing email | Email address, name, message content | **REVIEW REQUIRED** |
| SMS or push provider, if used | Booking notifications | Mobile number, message content | **REVIEW REQUIRED** |
| Error and performance monitoring, if used | Diagnostics | Pseudonymous user id, request id, stack context, IP | **REVIEW REQUIRED** |
| Analytics | Product measurement | Pseudonymous id, event properties, coarse geography | **REVIEW REQUIRED** |
| OpenStreetMap tile servers | Map tiles to the browser | The browser's IP and the tile coordinates it requests, which reveal approximate map viewport. No account data | Third party public infrastructure |
| Nominatim | Geocoding | Proxied server side, so the user's IP is not exposed. The query string may contain an address a host typed | Third party public infrastructure |
| OSRM | Directions | Proxied or deep-linked. Coordinates only | Third party public infrastructure |

Requirements:

1. A written data processing agreement with every processor that holds personal data,
   before production use. **REVIEW REQUIRED** on the required contractual terms under
   the DPDP framework.
2. No processor is added to production without an inventory row here and a sign-off.
3. Marketing email and transactional email should use separate credentials or separate
   sub-accounts, so that a withdrawal of marketing consent cannot accidentally suppress
   a booking confirmation, and so that a breach of one does not expose the other.
4. The analytics and monitoring processors must be configurable off entirely, because a
   user who withdraws consent for non-essential analytics must actually stop being sent
   there.

### 7.1 Cross-border transfer position

The platform's stated position is that personal data should be stored and processed in
India wherever the chosen vendor offers it, and that the Supabase project should be
provisioned in an Indian region if one is available on the selected plan. Vercel is an
edge platform and some processing, including log handling, is likely to occur outside
India.

**REVIEW REQUIRED:** the DPDP Act permits transfer outside India except to territories
restricted by notification, and sectoral regulators may impose stricter localisation.
Payment data in particular may be subject to a payment system data localisation
requirement, which would bear directly on the Razorpay integration and on what the
platform may store about an instrument. Counsel and the payment provider must confirm:
which Supabase region is actually in use, whether any payment-related data leaves India,
whether any storage localisation direction applies, and what the privacy policy may
truthfully say about all of this. Until that is confirmed, `24_Privacy_Policy.md` must
not assert that all data stays in India.

---

## 8. Retention, deletion, and the conflict with financial records

### 8.1 The conflict, stated plainly

A data principal has a right to erasure. The company has record-keeping obligations
arising from company law, tax law and payment regulation, and a legitimate need to
retain records to establish or defend a legal claim. These pull in opposite directions
over exactly the same rows: bookings, payments, refunds, payouts and invoices.

The engineering resolution is **erasure by de-identification of the personal layer, with
retention of the financial layer**. The booking row survives with its amounts, timestamps
and space reference. The link to a living, identifiable person is severed: the profile is
replaced with a tombstone, the name becomes "Deleted user", the email and phone are
nulled, the vehicle registration is replaced with a hash, the avatar is deleted, free
text authored by the user is deleted or redacted, and the `user_id` foreign key points at
a tombstone row.

**REVIEW REQUIRED:** the exact retention period for financial records, and whether a
de-identified booking row satisfies the record-keeping obligation or whether the
identity must genuinely be retained for a statutory period, is a question for a
chartered accountant and an advocate together. The engineering default used below is
**8 years** for financial records, chosen because it is a commonly applied outer bound in
Indian company record practice, and it is explicitly a placeholder, not a determination.
If counsel confirms a shorter period, shorten it, because retaining longer than required
is itself a privacy failure.

### 8.2 Retention schedule

| Class | Trigger | Period | Action at expiry |
| --- | --- | --- | --- |
| Application logs | Write | 30 days | Hard delete |
| Device location coordinates from check-in | Booking end | 90 days | Reduce to pass or fail flag |
| Messages | Thread end | 2 years | Hard delete |
| Support correspondence | Ticket closure | 2 years | Hard delete |
| Analytics at event grain | Event | 13 months | Aggregate, then delete raw |
| Check-in and check-out events | Booking end | 3 years | Reduce to non-identifying record |
| Disputes and evidence | Closure | 3 years, longer if a claim is live | Hard delete |
| Audit log | Write | 3 years, **REVIEW REQUIRED** | Hard delete |
| Verification documents | Account closure | Engineering default 1 year, **REVIEW REQUIRED** against any KYC obligation | Hard delete the object, keep only the outcome |
| Listings, including photos and exact address | Delisting | 1 year | Hard delete |
| Financial records: bookings, payments, refunds, payouts, invoices | Transaction | 8 years, placeholder, **REVIEW REQUIRED** | Hard delete |
| Profile, email, phone, vehicles | Account closure or erasure request | 90 days for the grace and reversal window | De-identify per 8.1 |

### 8.3 The deletion routine

1. **Stage one, immediate on request.** Account marked `deletion_requested`. Sign-in
   disabled. Listings withdrawn from public reachability. Future bookings cancelled
   under `23_Refund_Policy.md`. Marketing suppressed. The user is told, in the
   confirmation, exactly what will be deleted and what will be retained and why.
2. **A blocker check runs first.** Deletion cannot complete while the user has an active
   or upcoming booking, an unresolved dispute, an unpaid balance, or an unsettled
   payout. The user is told which blocker applies and when it will clear. A blocker may
   delay the routine, it may not cancel the right.
3. **Stage two, at 90 days** or on clearance of the last blocker, whichever is later:
   the de-identification in 8.1 executes as a single transaction, writes an audit row
   that records the tombstone id and not the former identity, and issues deletion
   instructions to every processor in section 7.
4. **Processor propagation is part of deletion, not an afterthought.** A deletion that
   leaves the email address live in the marketing provider has not happened.
5. **Backups.** Backups are not individually editable. The platform's position is that
   de-identification applies to the live system, and that backups age out on their own
   schedule, currently 35 days, after which the deleted data is gone. This position must
   be stated honestly in `24_Privacy_Policy.md` rather than implied away. **REVIEW
   REQUIRED** on whether that position is acceptable.
6. **Reviews written by a deleted user** remain, detached from the author, because
   removing them would distort the trust signal that other users relied on. **REVIEW
   REQUIRED** on whether a detached review is sufficiently de-identified given that its
   text and timing may make the author identifiable to the counterparty.

---

## 9. Children's data

1. The service is not offered to anyone under 18. Both `21_Host_Terms.md` and
   `22_Driver_Terms.md` require that the user be 18 or older and, for a driver, that
   they hold a valid driving licence, which itself carries a minimum age.
2. Age is self-declared at sign-up. The platform does not currently perform age
   verification. **REVIEW REQUIRED:** the DPDP Act imposes specific obligations towards
   children, including verifiable consent of a parent or guardian and a prohibition on
   tracking, behavioural advertising and targeted advertising directed at children.
   Counsel must confirm whether self-declaration plus the licence requirement is an
   adequate control for this service, or whether a verification step is required, and
   whether any exemption applies.
3. Regardless of the answer above, the platform must not run behavioural or targeted
   advertising at any user it knows or reasonably suspects is a child, and must not
   knowingly process a child's data for profiling.
4. If the platform becomes aware that an account holder is under 18, the account is
   suspended, active bookings are handled under the refund policy, and the personal data
   is deleted under section 8.3 with the blocker checks applied.
5. No feature may be designed to appeal specifically to minors.

---

## 10. Privacy by design in the development process

1. A new feature that touches personal data requires an inventory row in section 2 and
   a stated purpose before the pull request is approved.
2. Migrations that add a personal data column are labelled and reviewed with privacy in
   mind, including whether the column belongs in the public projection.
3. Seed and test data must be synthetic. Production data must never be copied into a
   development or preview environment. Preview deployments point at a non-production
   Supabase project, per `18_Security_Requirements.md` section 4.8.
4. Any feature that changes what is shown before a booking is confirmed must include a
   test against LP-1 through LP-9.
5. **REVIEW REQUIRED:** whether a formal Data Protection Impact Assessment is required,
   which depends on the Significant Data Fiduciary question in section 1. Independent of
   the legal answer, the engineering team should complete a lightweight assessment for
   the verification pipeline and for the check-in location feature, because those are the
   two highest-risk processing activities in the product.

---

## 11. Open items for counsel

| # | Question | Who answers |
| --- | --- | --- |
| 1 | Is `[COMPANY LEGAL NAME]` a Significant Data Fiduciary, and if so what follows | Advocate |
| 2 | Which processing sits inside a legitimate use and which requires express consent | Advocate |
| 3 | Breach notification trigger, timeline, content and recipient, including any CERT-In obligation | Advocate |
| 4 | Notice language obligations for a Kolkata-first launch | Advocate |
| 5 | Minimum retention for verification documents against any KYC or payment aggregator obligation | Advocate with the payment provider |
| 6 | Retention period for financial records, replacing the 8 year placeholder | Chartered accountant and advocate |
| 7 | Whether de-identification satisfies erasure against record-keeping obligations | Advocate |
| 8 | Payment data localisation and what the privacy policy may truthfully say about data location | Advocate with the payment provider |
| 9 | Children's data: sufficiency of self-declaration, and any verification requirement | Advocate |
| 10 | Statutory response times for access, correction, erasure and grievance | Advocate |
| 11 | Whether the platform's automated fraud scoring constitutes profiling requiring disclosure | Advocate |
| 12 | Contractual terms required in each data processing agreement | Advocate |

No entry in this table may be closed by an engineering decision.
