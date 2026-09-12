# 17. Admin Panel Specification

> Documents what exists under `src/app/admin/` and `src/app/api/admin/`, plus
> the shared plumbing in `src/lib/admin.ts`. Section 11 lists what is not built.

## 1. What actually exists

Fifteen files under `src/app/admin/` and five route handlers under
`src/app/api/admin/`.

| Path | Lines | Purpose |
| --- | --- | --- |
| `admin/layout.tsx` | 137 | The shell: role gate, nav, three distinct failure screens |
| `admin/page.tsx` | 372 | Platform overview, including the supply gap analysis |
| `admin/spaces/page.tsx` | 409 | The moderation queue |
| `admin/spaces/moderation-actions.tsx` | 134 | Approve and reject controls |
| `admin/users/page.tsx` | 243 | User list with server-side search |
| `admin/users/suspend-actions.tsx` | 124 | Suspend and reinstate controls |
| `admin/bookings/page.tsx` | 234 | Booking browser |
| `admin/payments/page.tsx` | 319 | Payments, refunds and reconciliation |
| `admin/disputes/page.tsx` | 230 | The dispute queue |
| `admin/disputes/dispute-actions.tsx` | 190 | Assign, prioritise, resolve |
| `admin/coupons/page.tsx` | 229 | Campaign list |
| `admin/coupons/coupon-form.tsx` | 338 | Coupon creation with unit conversion |
| `admin/settings/page.tsx` | 134 | Business rule engine |
| `admin/settings/settings-form.tsx` | 161 | Setting editor |
| `admin/audit/page.tsx` | 239 | The audit log |
| `api/admin/spaces/[id]/moderate/route.ts` | 140 | `POST` approve or reject |
| `api/admin/users/[id]/suspend/route.ts` | 148 | `POST` suspend or reinstate |
| `api/admin/disputes/[id]/route.ts` | 184 | `PATCH` work a dispute |
| `api/admin/coupons/route.ts` | 156 | `GET` list, `POST` create |
| `api/admin/settings/route.ts` | 159 | `GET` list, `PATCH` change |

Every nav item in the layout resolves to a real page. The panel is complete as a
read-and-moderate surface.

## 2. The access control model

Three layers, and the panel relies on all three rather than on any one.

| Layer | Mechanism | What it stops |
| --- | --- | --- |
| Edge middleware | `/admin` is in `ADMIN_PREFIXES`, so a signed-out visitor is redirected to `/auth/login?next=/admin` | An empty dashboard for someone who is simply not signed in. It checks presence, **not role** |
| The layout | `requireRole(['admin','support'])` in a Server Component | A signed-in non-admin reaching a page |
| Every API route | `requireAdmin([...])` in `src/lib/admin.ts` | Everything, including a direct `fetch` that never loaded a page |
| The database | `is_admin()` and `is_full_admin()` inside RLS policies, plus the `spaces_guard`, `profiles_guard_privileged` and `bookings_guard_direct` triggers | A compromised route, a missing check, or a service-role write that should not have happened |

### The service role is obtained only after the check

This is the load-bearing design decision in `src/lib/admin.ts`, and it is
enforced by the **shape of the return type**, not by discipline:

```ts
export type AdminGate =
  | { ok: true; context: AdminContext }   // AdminContext carries .service
  | { ok: false; error: AppError };
```

`requireAdmin` returns the service client **only on the success branch**. There
is no way to hold a privilege-bypassing client before the caller has been
identified as an admin, because the union type does not offer one. The file
comment states it directly: "The order matters and is enforced by the shape of
`requireAdmin`."

`adminServiceClient(tiers)` is the read-only convenience used by every page. It
wraps `requireAdmin` and returns `null` rather than a client when the caller is
not entitled to one, so a page that forgets to check gets a null pointer rather
than a working superuser.

**Why the service role at all.** Every read on the overview page crosses an RLS
boundary by design: an admin needs totals over rows no single user owns. A
request-scoped client would correctly return the admin's own bookings and
nothing else. The comment on `AdminOverviewPage` says this is "the narrow,
already-authorised exception the service key exists for", and it is the only
justification the panel uses.

### Two tiers

| Capability | `admin` | `support` |
| --- | --- | --- |
| Read every page | yes | yes |
| Work disputes: assign, prioritise, resolve | yes | **yes** |
| Approve or reject a listing | yes | no |
| Suspend or reinstate an account | yes | no |
| Create a coupon | yes | no |
| Change a platform setting | yes | no |
| Read the coupon list and the settings list | yes | yes |

Dispute handling is the whole of the support role, and everything support cannot
do sits elsewhere in the panel: settings, roles and money.

Note one asymmetry: the `spaces_guard` trigger exempts `is_admin()`, which
includes `support`, while `POST /api/admin/spaces/[id]/moderate` is gated to
`admin` only. The database is one tier more permissive than the route. That is
defence in depth working in the safe direction, but it is worth knowing.

### The failure screens

`AdminLayout` renders three different messages rather than one redirect.

| Reason | Message |
| --- | --- |
| Not configured | "The admin panel is not available yet", with the `.env.local` and `npm run db:push` instructions |
| Unauthenticated | "Sign in to continue", with a link to `/auth/login?next=/admin` |
| Suspended | "Your account is on hold", telling them to contact another administrator |
| Forbidden | "You do not have access to this area… You are signed in, but this account does not hold an admin or support role. Nothing is wrong with your sign in, and there is nothing to retry" |

The last one exists because of a specific failure mode the layout comment names:
bouncing an authenticated non-admin to a login page is "the single most confusing
thing an authorisation failure can do: it implies the credentials were wrong when
the credentials were fine and the permission was not."

## 3. The moderation queue

`/admin/spaces`. The largest page in the panel at 409 lines.

New listings arrive at `status = 'pending_review'`, because
`POST /api/host/spaces` creates them there and the `spaces_guard` trigger raises
`check_violation` on any host-initiated transition into `active`. A listing
therefore **cannot** go live without passing through this screen.

### The approve and reject flow

`POST /api/admin/spaces/[id]/moderate`, full admin only.

```
body: { action: 'approve' | 'reject', reason?: string }
  reject requires reason.length >= 10
```

| Step | Effect |
| --- | --- |
| Read | Fetch the current `status` and `rejection_reason` as the audit "before" |
| Write | `status := 'active' | 'rejected'`, `rejection_reason`, `reviewed_by := admin.userId`, `reviewed_at := now()` |
| Side effect | `parking_spaces_published` trigger stamps `published_at` the first time it reaches `active` |
| Audit | `listing.approve` or `listing.reject` on entity type `parking_space`, with before and after |
| Notify | `listing_approved` or `listing_rejected` to the host, `action_url: /host/spaces` |

The write goes through the service client because the guard trigger refuses a
status change into `active` or `rejected` from anyone the database does not
recognise as an admin.

**Why a rejection reason is mandatory.** The route comment gives the reasoning
without hedging: "A host whose listing is rejected without being told why has no
way to fix it, will assume the decision was arbitrary, and will not try again."
The reason is sent to the host as the notification body, not merely recorded, and
the host can edit and set `status: 'pending_review'` again through
`PATCH /api/host/spaces/[id]`, so a rejection is a loop rather than a dead end.

What a moderator is checking, given the fields the schema makes available: the
photos match the described space, the address and the pin agree, the height limit
is stated for a covered or basement space (the listing schema already requires
this), the price is not obviously fraudulent, and the access instructions would
actually get a stranger in.

## 4. User management and suspension

`/admin/users`. Search is a **server round trip on a submitted form**, not a live
browser filter. The page comment explains: "The table can hold every account on
the platform, so filtering in the browser would mean shipping the whole user
table to the browser, which is exactly the thing this panel exists to avoid doing
casually."

`POST /api/admin/users/[id]/suspend`, full admin only.

```
body: { action: 'suspend' | 'unsuspend', reason?: string }
  suspend requires reason.length >= 5
```

Suspension is the heaviest lever in the panel. It stops the person booking
(`create_booking_hold` returns `ACCOUNT_SUSPENDED` before doing any other work),
stops them reaching the admin panel, and removes them from `public_profiles`,
which is filtered `where not p.is_suspended`, so their host card and review
author line disappear from the public site.

Two guards, both returning HTTP 400 with a specific message:

| Guard | Message | Why |
| --- | --- | --- |
| `parsedId.data === admin.userId` | "You cannot suspend your own account." | The route comment: "not paternalism, it is the only cheap protection against locking the last administrator out of the panel" |
| `previous.role === 'admin' && suspending` | "Remove the admin role before suspending an administrator." | Forces a deliberate two-step for the most consequential action |

Always audited as `user.suspend` / `user.unsuspend`, always reversible from the
same screen, always notified to the affected user with the reason.

**Honest limitation:** suspension does not revoke the Supabase session. A
suspended user stays signed in and can still read their own data. Forcing a
sign-out would require calling the Supabase admin API to revoke refresh tokens,
which this build does not do.

## 5. The dispute workflow and its priority ladder

`/admin/disputes`, worked through `PATCH /api/admin/disputes/[id]`. Admin **and**
support.

### The priority ladder

`disputes.priority` is a `smallint` checked `between 0 and 3`, labelled in
`src/lib/dashboard.ts`:

| Priority | Label | What belongs here |
| --- | --- | --- |
| **0** | P0 safety | `unsafe_location`, anything involving a person's physical safety. A driver stranded at night at an address that does not exist |
| **1** | P1 blocked | `vehicle_blocked`, `access_failure`, `space_unavailable`. The driver cannot move their car or cannot get in. Time-critical because the person is standing there now |
| **2** | P2 money | `overcharged`, `wrong_location`, `space_too_small`, and the two no-show categories. Default. Painful but not urgent |
| **3** | P3 other | Everything else, including `other` |

The queue orders `priority ascending, created_at ascending`. The page comment
gives the reason for both keys: "a P0 safety case raised an hour ago outranks a
P2 money case raised last week, and because the oldest case at a given priority
is the one most at risk of being forgotten." Ordering by age alone would bury a
safety case behind a backlog; ordering by priority alone would let old P2s rot
forever.

The queue is backed by `disputes_status_idx on (status, priority) where status in
('open','investigating','awaiting_user')`, a partial index that matches the query
shape exactly.

### The state machine

```
open ──► investigating ──► awaiting_user ──┐
  │            │                           │
  │            └───────────────────────────┤
  │                                        ▼
  └──────────────────────────► resolved_driver
                               resolved_host
                               resolved_split
                               rejected
                               withdrawn  (by the raiser, not by support)
```

The four terminal `RESOLVED_STATUSES` in the route are `resolved_driver`,
`resolved_host`, `resolved_split` and `rejected`. Moving to any of them:

1. **Requires a resolution note of at least 10 characters.** The validator
   message is "Write a resolution note. Both parties are shown it." The route
   comment: "a resolution nobody can read is indistinguishable from being
   ignored."
2. Stamps `resolved_at`.
3. Writes a `dispute.update` audit row.
4. Queues a `dispute_resolved` notification to **both** `raised_by` and
   `against_id`, carrying the resolution note as the body and
   `action_url: /bookings/<booking_id>`.

### Assignment

`assign_to_self: true` sets `assigned_to = admin.userId`. The caller **can only
ever assign a case to themselves**; there is no field for assigning to another
agent. `unassign: true` clears it. That is a deliberate pull model rather than a
push model: an agent takes a case, which means the person who owns it is the
person who chose it.

### The gap

**Nothing in the driver or host UI raises a dispute.** The `disputes` table, its
RLS policies (`disputes_participant_insert` permits a booking participant to
insert), the categories, the priority ladder and the entire admin workflow are
built. The form that would create a row does not exist, so the queue is
permanently empty in this build. Resolving a dispute also does not move money:
`disputes.refund_id` exists and nothing sets it.

## 6. The coupon manager and the basis-points-versus-paise trap

`/admin/coupons`, created through `POST /api/admin/coupons`, full admin only.

### The trap

`coupons.value` is a single `bigint` column whose **unit depends on
`coupon_type`**:

| `coupon_type` | Unit of `value` | "10 percent off" | "Rs 50 off" |
| --- | --- | --- | --- |
| `percent` | basis points | `1000` | n/a |
| `flat` | paise | n/a | `5000` |

A human typing "10" could plausibly mean 10 percent (1000 bp) or Rs 10 (1000
paise), and the same digits mean entirely different things. Getting it wrong by
one factor of 100 produces a coupon that is a hundred times too generous, and the
discovery mechanism is the finance report rather than anyone reading a form.

### How the three layers defend against it

**1. The form converts once, in one place.** `coupon-form.tsx`:

```ts
const storedValue = amountValid
  ? type === 'percent'
    ? Math.round(amountNumber * 100)   // percent → basis points
    : rupeesToPaise(amountNumber)      // rupees  → paise
  : null;
```

**2. The form states in words what will be stored**, live, under the input:

```
"10% off, stored as 1000 basis points."
"₹50 off, stored as 5000 paise."
```

The comment: the preview exists "because a coupon that turns out to be a hundred
times too generous is discovered by the finance report rather than by anyone
reading a form."

**3. The route re-checks the ceiling.** It receives **storage units** and
validates them as such:

```ts
.refine((value) => value.coupon_type !== 'percent' || value.value <= 10_000, {
  message: 'A percentage cannot exceed 100 percent, which is 10000 basis points',
})
```

The route comment is blunt about why: "a client that sends 100000 basis points is
either broken or hostile and both deserve the same answer." The database backs it
up independently with `constraint coupons_percent_bounds check (coupon_type <>
'percent' or value <= 10000)`.

**4. The list shows both units on every row.** The page comment: "Anyone auditing
a campaign wants the first, anyone debugging a discount that came out wrong wants
the second, and showing only one of them guarantees somebody eventually reads it
as the other."

### The rest of the coupon model

| Field | Meaning |
| --- | --- |
| `code` | Uppercased, 3 to 40 characters, `[A-Za-z0-9_-]` only. Unique; a collision returns 409 "A coupon with that code already exists." |
| `max_discount_paise` | Caps a percentage coupon in absolute terms |
| `min_booking_paise` | Floor on the base amount |
| `max_redemptions` | Global cap, checked against `redemption_count` |
| `max_per_user` | Checked against `coupon_redemptions` for that user |
| `new_users_only`, `first_booking_only` | Eligibility flags, both evaluated in `quote_booking` |
| `restricted_cities` | Checked against `parking_spaces.city`. **Not settable from this form** |
| `valid_from`, `valid_until` | Window; `valid_until` must be after `valid_from` |

Validation happens in `quote_booking`, which returns one of nine `COUPON_*` codes
in `coupon_error` rather than failing the quote, so the driver sees the price and
the explanation in one round trip. Redemption is recorded at
`confirm_booking`, not at quote time, and is released again by `cancel_booking`.

Creation is audited as `coupon.create` with the full row as the audit "after".

**Limitation:** the API is create and list only. There is no edit and no delete,
so deactivating a live campaign requires a database write. `is_active` exists on
the row and is settable at creation.

## 7. The platform_settings business rule engine

`/admin/settings`, changed through `PATCH /api/admin/settings`, full admin only.

These sixteen values decide what every future booking costs, how long a hold
lasts and how much grace an overstay gets. Changing one is a business decision
with financial consequences, so the route enforces three things it describes as
non-negotiable:

1. **Full admin only.** Support does not set commission.
2. **Every change writes an audit row** with the before and after value.
3. **A value is parsed as JSON and stored as JSON**, because the column is
   `jsonb` and `setting_numeric()` casts it. Writing a bare string where a number
   is expected would silently break pricing on the next quote.

```ts
function parseSettingValue(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { return raw; }          // a bare word becomes a JSON string
}
```

The route is also **key-closed**: settings are seeded by migration, and a key
that does not already exist is rejected with "There is no setting with that key"
rather than created. Inventing new keys from a form would produce configuration
nothing reads.

Changes are applied one at a time in a loop, up to 50 per request, with a
per-key result. A key whose new value equals the old one is skipped silently. The
response returns `applied` (the list of `{key, before, after}`) and a `fields`
map of rejections, with `ok: false` if anything was rejected. That is a partial
success, deliberately: a batch that rolls back entirely because one key was
mistyped would be worse.

The settings page carries plain-language consequence copy alongside each setting,
because "the `description` column says what a setting is. This says what happens
when you change it, which is the thing somebody about to change it actually needs
to know."

Critically, a rate change is **not retroactive**: `commission_rate_bp`,
`service_fee_rate_bp` and `tax_rate_bp` are frozen onto each booking row at quote
time, so changing `HOST_COMMISSION_PCT` today cannot restate last month's
bookings.

## 8. The audit log

`/admin/audit`. Append-only in practice: nothing in the application updates or
deletes a row, and RLS grants no client role anything but `select` via
`audit_admin_read using (is_admin())`.

| Column | Content |
| --- | --- |
| `actor_id`, `actor_role` | Who, and at what tier |
| `action` | `listing.approve`, `listing.reject`, `user.suspend`, `user.unsuspend`, `dispute.update`, `coupon.create`, `settings.update` |
| `entity_type`, `entity_id` | `parking_space`, `profile`, `dispute`, `coupon`, `platform_setting` |
| `before_state`, `after_state` | `jsonb` snapshots of the changed fields only, not whole rows |
| `ip_address`, `user_agent` | From `x-forwarded-for` (leftmost entry) and the UA header |

Three indexes cover the three query shapes: by actor, by entity, by action, each
with `created_at desc`.

**`writeAuditLog` never throws.** The comment: "An audit write that fails must
not roll back the action it was describing, because an unrecorded change is bad
and a change that silently did not happen is worse." Failures go to the log for
the operator instead.

The page comment states what the screen is for: "the answer to 'who changed
that, and what did it used to be', which is the question every incident
eventually reduces to."

Two honest caveats: the log covers **admin actions only**. Nothing a driver or
host does is audited here; the equivalent for a booking is `booking_events`.
And there is no tamper-evidence: an operator with direct database access can
alter a row, because the append-only property is a convention plus an RLS grant,
not a hash chain.

## 9. The supply gap analysis, and why it is the most valuable screen

`search_events` records every search, including `result_count`. A row with
`result_count = 0` is the cheapest demand signal this product has: **it names a
place where somebody wanted to park and could not.** The migration puts a comment
on the index saying exactly that:

```sql
comment on index search_events_zero_results_idx is
  'Powers the supply gap map in the admin panel. Zero-result searches are the
   demand signal that tells the field team which street to canvass next.';
```

### How it is computed

On the overview page, over a **14-day window**, capped at 2000 rows:

```ts
const lat = Math.round(event.lat * 100) / 100;
const lng = Math.round(event.lng * 100) / 100;
const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
```

Rounding to two decimal places groups to roughly 1.1 km, which the page comment
justifies as "about the radius a driver will walk from". Within each cell it
counts searches, tracks `lastSeen`, and picks the **modal `query_text`** as the
human-readable label, falling back to the coordinate pair. The top ten cells by
search count are shown.

### Why it matters more than any other screen here

Every other admin screen is a **cost** screen. Moderation, suspensions, disputes
and reconciliation all exist to keep the machine running. They tell you how well
you are serving the supply you already have.

The supply gap is the only screen that tells you **where your next revenue is**,
and it does so with a signal that costs nothing to collect and that no competitor
can see. Spec kernel section 2 names density as a product pillar: "Success is
supply density inside a neighbourhood, not national listing count." A zero-result
search is the precise, geolocated, timestamped statement that density is
insufficient at a named point, backed by a real person who wanted to transact
there and could not.

Operationally it converts directly into work. A cell with 40 zero-result searches
in 14 days, labelled "Lake Gardens", is an instruction: send someone to Lake
Gardens and sign up driveways. A marketplace acquires supply blind without it, or
buys survey data to learn the same thing worse and later.

Two limitations of the current implementation worth stating: the 2000-row cap
means a busy fortnight truncates the data, and the aggregation happens in
JavaScript on every page load rather than in SQL, so it will not scale past that
cap. A `GROUP BY round(lat,2), round(lng,2)` query would.

Note also that `search_events` has `search_events_insert_any with check (true)`,
so anyone, including an anonymous visitor, may insert. That is necessary for
anonymous search to be measured at all, and it means the table is pollutable by
anyone who can reach `/api/search`, which is currently rate-limited by nothing.

## 10. Reconciliation screens

| Screen | Purpose |
| --- | --- |
| `/admin/bookings` | Browse every booking regardless of owner, filter by status. The `booking_events` trail is the per-booking detail |
| `/admin/payments` | Payments, refunds, and the `webhook_events` rows that did not process. This is where the "PAYMENT TAKEN BUT BOOKING NOT CONFIRMED" case surfaces, as a `webhook_events` row with a `processing_error` and a null-ish outcome |

The payments screen is the operational counterpart to the limitation in
`15_Payment_Specification.md`: refunds are recorded as `requested` and never
issued, so this screen is currently the only way anyone would learn that a refund
is outstanding.

## 11. What is not built

| Item | Status |
| --- | --- |
| Dispute creation | No driver or host UI raises a dispute, so the queue is empty |
| Dispute-driven refunds | `disputes.refund_id` exists, nothing sets it |
| Issuing a refund from the panel | No action calls `provider.refund()`. `refunds` rows stay `requested` |
| Running a payout | `payouts` and `payout_items` exist, nothing writes them |
| KYC review | `verification_documents` and `host_profiles.kyc_status` exist, with no queue screen and no upload route feeding one |
| Editing or deactivating a coupon | Create and list only |
| Granting or revoking a role | `profiles.role` is admin-writable in principle; no UI does it |
| Impersonation or "view as user" | Not implemented, and deliberately so: it is the highest-risk feature an admin panel can have |
| Bulk actions | Every action is one entity at a time |
| Export | No CSV or report download anywhere |
| Rate limiting on admin routes | None of the five routes applies a limiter |
| Two-factor authentication for admins | Not implemented |
| Tamper-evident audit | The log is append-only by convention and RLS grant, not by construction |
