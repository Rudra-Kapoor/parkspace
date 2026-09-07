# ParkSpace: Non Functional Requirements

> Derived from `00_SPEC_KERNEL.md`. Where this document and the kernel disagree, the
> kernel wins. Document number 09.

Every requirement here is numbered `NFR-<GROUP>-<NNN>`, carries a priority of MUST,
SHOULD or COULD, and states a number that can be measured. A non functional requirement
without a number is an opinion, not a requirement.

---

## 1. Performance

### 1.1 Server time budgets

Server time means the time from the first byte of the request reaching the Next.js route
handler to the last byte of the response leaving it, excluding client network transit.
All figures are measured over a rolling 7 day window in production.

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-PERF-001 | Availability-aware search server time | MUST | p50 under 150 ms, p95 under 400 ms, p99 under 900 ms |
| NFR-PERF-002 | Listing detail server render | MUST | p95 under 500 ms |
| NFR-PERF-003 | Quote computation | MUST | p95 under 120 ms, it is pure computation over a small row set |
| NFR-PERF-004 | Hold creation, the transaction that takes the exclusion constraint | MUST | p95 under 250 ms |
| NFR-PERF-005 | Payment initiation, excluding provider round trip | MUST | p95 under 200 ms |
| NFR-PERF-006 | Webhook processing to committed state change | MUST | p95 under 300 ms |
| NFR-PERF-007 | Check-in scan validation | MUST | p95 under 200 ms, it happens at a gate with a queue behind it |
| NFR-PERF-008 | Geocode through the Nominatim proxy, cache hit | MUST | p95 under 40 ms |
| NFR-PERF-009 | Geocode through the Nominatim proxy, cache miss | SHOULD | p95 under 1200 ms, bounded by the upstream one request per second policy |
| NFR-PERF-010 | Admin list views over 90 days of data | SHOULD | p95 under 800 ms |

### 1.2 Client and map budgets

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-PERF-011 | Map first paint, first visible tile on the search page | MUST | under 1.5 s on a 4G connection at the 75th percentile |
| NFR-PERF-012 | Map interactive, pan and zoom responding to input | MUST | under 2.5 s on the same connection profile |
| NFR-PERF-013 | Map frame rate during pan with up to 200 markers | SHOULD | 50 frames per second or better on a mid-range Android device |
| NFR-PERF-014 | Marker clustering recomputation on viewport change | SHOULD | under 80 ms for 500 markers |
| NFR-PERF-015 | Search result list update after a viewport change | MUST | under 700 ms from debounce fire to painted list |

### 1.3 Core Web Vitals

Measured as field data at the 75th percentile, segmented by device class.

| ID | Page class | Priority | LCP | INP | CLS |
| --- | --- | --- | --- | --- | --- |
| NFR-PERF-016 | Landing and SEO pages | MUST | under 2.0 s | under 200 ms | under 0.05 |
| NFR-PERF-017 | Listing detail | MUST | under 2.5 s | under 200 ms | under 0.10 |
| NFR-PERF-018 | Search with map | SHOULD | under 3.0 s | under 250 ms | under 0.10 |
| NFR-PERF-019 | Checkout and payment | MUST | under 2.0 s | under 150 ms | under 0.05 |

### 1.4 Payload budgets

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-PERF-020 | JavaScript shipped on the landing page | MUST | under 120 KB compressed |
| NFR-PERF-021 | JavaScript shipped on the search page including MapLibre | SHOULD | under 320 KB compressed, MapLibre loaded only on routes that render a map |
| NFR-PERF-022 | Largest listing photo delivered to a mobile viewport | MUST | under 180 KB, served in a modern format at a device-appropriate size |
| NFR-PERF-023 | Search API response for one page of 20 results | SHOULD | under 60 KB uncompressed |

---

## 2. Scalability and growth path

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-SCALE-001 | Concurrent authenticated sessions supported without degradation beyond the stated budgets | MUST | 500 at launch |
| NFR-SCALE-002 | Search queries per second sustained | MUST | 50 per second, with the stated p95 held |
| NFR-SCALE-003 | Booking writes per second sustained | MUST | 10 per second, with zero exclusion constraint deadlocks |
| NFR-SCALE-004 | Live listings in the database before any architectural change is required | MUST | 10,000 |
| NFR-SCALE-005 | Bookings retained online before partitioning is considered | SHOULD | 2 million rows |

### 2.1 The growth path, stated as ordered steps

The system is not designed for a scale it does not have. It is designed so that each
scale step is a known, bounded change.

| Stage | Trigger | Action |
| --- | --- | --- |
| 1. Launch | Now | Single Supabase project, free tier, Vercel free tier, no cache layer beyond the geocode cache |
| 2. First strain | Search p95 above 400 ms | Add covering indexes on `(space_id, bay_index, period)` and a spatial index on `approx_point`. Measure before adding anything else. |
| 3. Read pressure | Search p95 still above budget after indexing | Introduce a short-lived server cache for availability by `(neighbourhood, day)`, invalidated on any booking write for that neighbourhood |
| 4. Connection pressure | Connection pool saturation | Move to Supabase connection pooling in transaction mode for the stateless read paths, keep session mode for the booking transaction |
| 5. Instance pressure | CPU sustained above 70 percent | Upgrade the Supabase compute tier. This is a plan change, not a rewrite. |
| 6. Read replica | Read to write ratio above 20 to 1 | Route search and SEO pages to a read replica. The booking transaction never leaves the primary, because the exclusion constraint must see the authoritative state. |
| 7. Partition | Bookings above 2 million rows and archive queries slowing writes | Partition `bookings` by month. The exclusion constraint becomes per-partition, which is acceptable because bookings never span partitions by more than `MAX_BOOKING_DAYS`. |
| 8. Second city | Kolkata density target met | Region is already a column. Add the city, add its neighbourhoods, add its SEO pages. No schema change. |

---

## 3. Availability and error budget

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-AVAIL-001 | Monthly availability of the booking path: search, quote, hold, pay, confirm | MUST | 99.5 percent, an error budget of 3 hours 39 minutes per 30 days |
| NFR-AVAIL-002 | Monthly availability of the check-in path | MUST | 99.9 percent, an error budget of 43 minutes per 30 days. A driver at a gate cannot wait. |
| NFR-AVAIL-003 | Monthly availability of public and SEO pages | SHOULD | 99.9 percent, served from the edge cache where the origin is unavailable |
| NFR-AVAIL-004 | Monthly availability of the admin surface | COULD | 99.0 percent |
| NFR-AVAIL-005 | Maximum planned maintenance window | SHOULD | 30 minutes per month, outside 07:00 to 23:00 India Standard Time |
| NFR-AVAIL-006 | Degraded mode: when the payment provider is unreachable, search, listing pages and check-in continue to work | MUST | Checkout returns a clear, recoverable error and the hold is preserved for its full window |
| NFR-AVAIL-007 | Degraded mode: when the geocoder is unreachable, map viewport search continues to work | MUST | Text search returns a clear message and the map path is unaffected |
| NFR-AVAIL-008 | Degraded mode: when tile delivery fails, the result list remains fully usable | MUST | The list view renders and is operable with no map present |

### 3.1 Error budget policy

If the booking path consumes more than 50 percent of its monthly error budget, all
feature work stops until reliability work brings the burn rate back under target. This is
a rule, not a guideline. The error budget is the only mechanism that makes reliability
compete with features on equal terms.

---

## 4. Data durability, backup and restore

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-DATA-001 | Recovery Point Objective for transactional data: bookings, payments, ledger | MUST | 5 minutes, achieved through continuous write-ahead log archiving and point in time recovery |
| NFR-DATA-002 | Recovery Time Objective for a full database restore | MUST | 4 hours |
| NFR-DATA-003 | Recovery Point Objective for Storage objects: photos, documents, evidence | SHOULD | 24 hours |
| NFR-DATA-004 | Recovery Time Objective for Storage objects | SHOULD | 12 hours |
| NFR-DATA-005 | Restore drill cadence, a real restore into a scratch project with verification queries | MUST | Monthly. A backup that has never been restored is a hypothesis. |
| NFR-DATA-006 | Backup retention | MUST | 30 days point in time, plus a monthly snapshot retained 12 months |
| NFR-DATA-007 | Ledger integrity | MUST | The sum of ledger movements equals the sum of balances with a difference of exactly zero paise, verified nightly and alerted on failure |
| NFR-DATA-008 | Booking overlap integrity | MUST | A nightly query proves zero overlapping bookings in `pending`, `confirmed` or `active` on any `(space_id, bay_index)` pair |
| NFR-DATA-009 | No destructive migration without a tested rollback and a pre-migration snapshot | MUST | Every migration is reversible or paired with a snapshot taken in the same deployment step |

---

## 5. Security posture

| ID | Requirement | Priority | Detail |
| --- | --- | --- | --- |
| NFR-SEC-001 | Row Level Security enabled on every table holding user data, with a default deny policy | MUST | A table with RLS enabled and no policy returns zero rows. That is the intended default. |
| NFR-SEC-002 | Location privacy enforced at the database layer | MUST | Exact coordinates, full address, gate number and access instructions are readable only by the booking driver from 24 hours before start, by the listing host, by `admin` and by `support` |
| NFR-SEC-003 | Transport security | MUST | TLS 1.2 or better on every connection, HSTS with a minimum age of 6 months |
| NFR-SEC-004 | Content Security Policy | MUST | Explicit allowlist covering the tile host, the geocode proxy origin, the Supabase origin and the payment provider. No wildcard script source. |
| NFR-SEC-005 | Secrets | MUST | No secret in source control, no service role key in any client bundle, verified by a build-time scan that fails the build |
| NFR-SEC-006 | Webhook authenticity | MUST | Every inbound webhook signature verified before any processing, with replay protection by event identifier |
| NFR-SEC-007 | File upload safety | MUST | Content type and magic byte validation, size limits, EXIF stripping, upload to a private bucket first and promotion to public only after validation |
| NFR-SEC-008 | Storage bucket policy | MUST | Three buckets with distinct policies: public listing photos, private verification documents, private dispute evidence |
| NFR-SEC-009 | Password handling | MUST | Delegated entirely to Supabase Auth. The application never sees, stores or logs a password. |
| NFR-SEC-010 | Session handling | MUST | HTTP-only, secure, same-site cookies. Refresh token rotation enabled. |
| NFR-SEC-011 | Dependency vulnerability scanning | MUST | On every pull request. A critical advisory blocks merge. |
| NFR-SEC-012 | Administrative privilege | MUST | `admin` and `support` require a second authentication factor. Every action is audited. |
| NFR-SEC-013 | Input validation | MUST | Every API boundary validates against a schema. Invalid input is rejected before it reaches business logic. |
| NFR-SEC-014 | QR pass tokens | MUST | Signed, scoped to one booking, non-guessable, and useless outside the check-in window |
| NFR-SEC-015 | Brute force protection on authentication | MUST | 5 failed attempts locks passcode verification for 15 minutes per email address, and an IP-level limit applies independently |

---

## 6. Privacy and data residency

| ID | Requirement | Priority | Detail |
| --- | --- | --- | --- |
| NFR-PRIV-001 | Data residency | MUST | All personal data stored in an Indian region. The Supabase project region is pinned and documented. |
| NFR-PRIV-002 | Data minimisation | MUST | Collect only what a stated requirement needs. No date of birth, no government identifier stored in plain form beyond what verification requires. |
| NFR-PRIV-003 | Verification document retention | MUST | Retained while the host is active and for 12 months after account closure, then deleted |
| NFR-PRIV-004 | Dispute evidence retention | SHOULD | Retained for 24 months after resolution, subject to open question OQ9 in `02_Product_Requirements_Document.md` |
| NFR-PRIV-005 | Export on request | MUST | A user can obtain a machine readable export of their profile, vehicles, bookings, messages, reviews and ledger within 30 days of request |
| NFR-PRIV-006 | Deletion on request | MUST | Personal fields are erased or irreversibly pseudonymised. Financial ledger rows are retained in pseudonymised form because they are a statutory record. |
| NFR-PRIV-007 | Consent for non-transactional communication | MUST | Marketing email and SMS require explicit opt-in. Transactional messages are sent regardless. |
| NFR-PRIV-008 | Third party data sharing | MUST | Personal data leaves the platform only to the payment provider, the email provider and the SMS provider, each named in the privacy policy |
| NFR-PRIV-009 | Geocoding privacy | MUST | The Nominatim proxy forwards only the query string. No user identifier, no session token and no IP forwarding header reaches the upstream service. |
| NFR-PRIV-010 | Prohibited logging | MUST | Never log: full address before release, exact coordinates, payment card data, one time passcodes, authentication tokens, QR token payloads, verification document contents, message bodies |

---

## 7. Accessibility

Target: WCAG 2.2 Level AA across every user-facing surface. A map interface has specific
obligations that a generic accessibility statement does not cover, so they are stated
explicitly.

| ID | Requirement | Priority | Detail |
| --- | --- | --- | --- |
| NFR-A11Y-001 | Conformance level | MUST | WCAG 2.2 AA on all public, driver and host surfaces. Admin surfaces target AA and are permitted to lag by one release. |
| NFR-A11Y-002 | Keyboard operability | MUST | Every function, including booking end to end, is completable with a keyboard alone, with a visible focus indicator meeting the 2.2 focus appearance criterion |
| NFR-A11Y-003 | Map alternative | MUST | Every search result available on the map is available in an equivalent, fully operable list. The list is not a degraded fallback, it is a peer view. |
| NFR-A11Y-004 | Map keyboard controls | MUST | Pan, zoom and marker selection are reachable by keyboard. Markers are exposed as focusable elements with accessible names, not as canvas pixels. |
| NFR-A11Y-005 | Map non-colour encoding | MUST | Availability, price band and selection state are never conveyed by colour alone. Shape, label or text accompanies every colour signal. |
| NFR-A11Y-006 | Map motion | MUST | Fly-to animations and marker transitions respect `prefers-reduced-motion` and become instant transitions when it is set |
| NFR-A11Y-007 | Map announcements | MUST | A live region announces the result count after every viewport search, so a screen reader user knows the list changed |
| NFR-A11Y-008 | Map dragging alternative | MUST | Pin placement during listing creation offers a text address entry and a coordinate entry alongside dragging, satisfying the dragging movements criterion |
| NFR-A11Y-009 | Target size | MUST | Interactive targets, including map markers and cluster bubbles, are at least 24 by 24 CSS pixels with adequate spacing |
| NFR-A11Y-010 | Contrast | MUST | 4.5 to 1 for body text, 3 to 1 for large text and for user interface components, including marker glyphs against every tile background they can sit on |
| NFR-A11Y-011 | Forms | MUST | Every input has a persistent visible label, errors are announced and are described in text, and the listing wizard reports step progress to assistive technology |
| NFR-A11Y-012 | Time limits | MUST | The booking hold countdown is announced, and the driver is warned before expiry with enough time to act, satisfying the timing adjustable criterion |
| NFR-A11Y-013 | Accessible authentication | MUST | No cognitive function test without an alternative. Passcode entry supports paste. |
| NFR-A11Y-014 | Automated and manual testing | MUST | Automated checks run in continuous integration on every route, and a manual screen reader pass covers the booking flow each release |

---

## 8. Internationalisation and localisation readiness

The MVP ships in English for a single market. It ships in a shape that does not need
rewriting to add a second language.

| ID | Requirement | Priority | Detail |
| --- | --- | --- | --- |
| NFR-I18N-001 | No user-visible string is hard-coded in a component | MUST | Every string resolves through a message catalogue keyed by identifier |
| NFR-I18N-002 | Locale-aware formatting | MUST | Dates, times, numbers and currency are formatted through the platform Intl interfaces, never by string concatenation |
| NFR-I18N-003 | Currency presentation | MUST | Amounts are stored in paise and rendered as "Rs 300" or "INR 300" at the presentation boundary only |
| NFR-I18N-004 | Time zone correctness | MUST | All timestamps are stored with time zone. Availability is authored and displayed in the listing's local time. The booking period is a `tstzrange`. |
| NFR-I18N-005 | Planned languages | SHOULD | English at launch, Bengali and Hindi as the first additions. Catalogue keys are created with those in mind. |
| NFR-I18N-006 | Text expansion tolerance | SHOULD | Layouts survive a 40 percent string length increase without truncation or overflow |
| NFR-I18N-007 | Right to left readiness | COULD | Layout uses logical properties so that a future right to left locale does not require a stylesheet rewrite |
| NFR-I18N-008 | Character handling | MUST | Full Unicode support in names, addresses and message bodies, stored and indexed correctly |

---

## 9. Observability

| ID | Requirement | Priority | Detail |
| --- | --- | --- | --- |
| NFR-OBS-001 | Structured logging | MUST | JSON logs with request identifier, user identifier where authenticated, route, status, duration and error code. No free-form log lines in production paths. |
| NFR-OBS-002 | Correlation | MUST | One request identifier propagates from the browser request through every server call, every database statement tag and every webhook side effect |
| NFR-OBS-003 | Metrics | MUST | Request rate, error rate and duration per route class. Business counters for holds created, holds expired, bookings confirmed, payments captured, refunds issued, check-ins completed. |
| NFR-OBS-004 | Traces | SHOULD | Distributed traces on the booking path, spanning quote, hold, payment initiation, webhook and confirmation |
| NFR-OBS-005 | Database observability | MUST | Slow query log at 200 ms, exclusion constraint violation counter, connection pool saturation gauge |
| NFR-OBS-006 | Job observability | MUST | Every scheduled job reports start, end, duration, items processed and items failed. A job that does not report is treated as failed. |
| NFR-OBS-007 | Log retention | SHOULD | 30 days hot, 12 months for audit and payment events |

### 9.1 Always alertable conditions

These must page a human, not merely appear on a dashboard.

| ID | Condition | Priority | Threshold |
| --- | --- | --- | --- |
| NFR-OBS-008 | Hold expiry job has not completed successfully | MUST | No successful run in 5 minutes. Inventory starves silently otherwise. |
| NFR-OBS-009 | Payment captured with no confirmed booking | MUST | Any single occurrence unresolved for 15 minutes |
| NFR-OBS-010 | Webhook processing failure rate | MUST | Above 1 percent over 10 minutes, or any webhook retried more than 5 times |
| NFR-OBS-011 | Ledger imbalance | MUST | Any non-zero imbalance at the nightly close |
| NFR-OBS-012 | Overlapping bookings detected | MUST | Any single occurrence. This is a violation of the central product guarantee. |
| NFR-OBS-013 | Booking path error rate | MUST | Above 2 percent over 5 minutes |
| NFR-OBS-014 | Check-in path error rate or latency | MUST | Error rate above 1 percent, or p95 above 500 ms, over 5 minutes |
| NFR-OBS-015 | Search p95 latency | SHOULD | Above 400 ms for 15 minutes |
| NFR-OBS-016 | Database connection saturation | MUST | Above 85 percent of the pool for 5 minutes |
| NFR-OBS-017 | Authentication failure spike | SHOULD | Failure rate more than 5 times the 7 day baseline over 10 minutes |
| NFR-OBS-018 | Storage upload failure rate | SHOULD | Above 5 percent over 15 minutes |

---

## 10. Rate limits by endpoint class

Limits are applied per authenticated user where a session exists and per IP address
otherwise. Exceeding a limit returns HTTP 429 with a `Retry-After` header.

| ID | Endpoint class | Priority | Limit |
| --- | --- | --- | --- |
| NFR-RATE-001 | Authentication: sign up, sign in, passcode request | MUST | 5 per 15 minutes per email address, 20 per hour per IP address |
| NFR-RATE-002 | Passcode verification | MUST | 5 per 15 minutes per email address, then a 15 minute lock |
| NFR-RATE-003 | Search, availability aware | MUST | 60 per minute per session, 120 per minute per IP address |
| NFR-RATE-004 | Geocode proxy | MUST | 20 per minute per session, and never more than 1 upstream request per second in total across the whole platform |
| NFR-RATE-005 | Quote | MUST | 30 per minute per session |
| NFR-RATE-006 | Hold creation | MUST | 10 per minute per user, and at most 3 concurrent open holds per user |
| NFR-RATE-007 | Payment initiation | MUST | 10 per minute per user, deduplicated by idempotency key |
| NFR-RATE-008 | Webhook ingress | MUST | Not rate limited by user, protected by signature verification and by event identifier deduplication |
| NFR-RATE-009 | Check-in and check-out scan | MUST | 30 per minute per host device |
| NFR-RATE-010 | File upload | MUST | 30 per hour per user, 20 photos per listing, 10 MB per file |
| NFR-RATE-011 | Messaging | MUST | 30 messages per hour per thread |
| NFR-RATE-012 | Review submission | MUST | 1 per booking per direction |
| NFR-RATE-013 | Coupon validation | MUST | 10 per minute per user, to prevent code enumeration |
| NFR-RATE-014 | Admin bulk operations | SHOULD | 5 per minute per admin user |
| NFR-RATE-015 | Public SEO pages | SHOULD | Served from cache, 300 per minute per IP address before throttling |

---

## 11. Browser and device support matrix

| ID | Tier | Priority | Scope | Commitment |
| --- | --- | --- | --- | --- |
| NFR-COMP-001 | Tier 1 | MUST | Chrome and Edge, current and previous 2 major versions; Safari on iOS 16 and above; Chrome on Android 12 and above; Firefox current and previous | Full functionality, full visual fidelity, tested every release |
| NFR-COMP-002 | Tier 2 | SHOULD | Safari on macOS 2 versions back, Samsung Internet current | Full functionality, minor visual variation accepted |
| NFR-COMP-003 | Tier 3 | COULD | Older WebGL-capable browsers | Core booking flow works, map may fall back to the list view |
| NFR-COMP-004 | Unsupported | MUST | Internet Explorer, and any browser without WebGL and without ES2020 | A clear message and a link to the list-only search view |
| NFR-COMP-005 | Reference device for performance budgets | MUST | A mid-range Android handset on a 4G connection, not a development laptop on office broadband |
| NFR-COMP-006 | Viewport range | MUST | 320 CSS pixels to 2560 CSS pixels wide, with no horizontal scrolling at any width |
| NFR-COMP-007 | Map fallback | MUST | Where WebGL is unavailable, the list view renders and the entire booking flow remains completable |
| NFR-COMP-008 | Offline behaviour | SHOULD | A confirmed booking's QR access pass renders from cache when the device is offline at the gate |
| NFR-COMP-009 | Camera access | MUST | The host scan view degrades to manual code entry where camera permission is denied or unavailable |
| NFR-COMP-010 | Print | COULD | The booking pass and the host settlement statement print legibly on A4 |

---

## 12. Maintainability and operational quality

| ID | Requirement | Priority | Target |
| --- | --- | --- | --- |
| NFR-MAINT-001 | Unit test coverage on pricing, availability, policy and state transition logic | MUST | 95 percent line coverage, these are pure functions and there is no excuse |
| NFR-MAINT-002 | Integration test coverage of the booking path including concurrency | MUST | A test that runs two concurrent bookings for the same interval and asserts exactly one succeeds |
| NFR-MAINT-003 | Row Level Security policy test suite | MUST | Every policy has a positive and a negative test, including the 24 hour location release boundary |
| NFR-MAINT-004 | Type safety | MUST | TypeScript strict mode, no implicit `any`, database types generated from the schema |
| NFR-MAINT-005 | Continuous integration gate | MUST | Lint, type check, unit tests, integration tests, accessibility checks and a secret scan all pass before merge |
| NFR-MAINT-006 | Deployment | MUST | Every deployment is atomic and revertible to the previous build in under 5 minutes |
| NFR-MAINT-007 | Configuration | MUST | Every tunable value from the kernel settings table is runtime editable. Changing a rate never requires a deployment. |
| NFR-MAINT-008 | Documentation currency | SHOULD | A change to a kernel decision updates `00_SPEC_KERNEL.md` in the same pull request that changes the code |
