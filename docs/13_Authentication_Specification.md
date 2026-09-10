# 13. Authentication Specification

> Describes the authentication and authorisation model as implemented in
> `src/components/auth-form.tsx`, `src/app/auth/callback/route.ts`,
> `src/middleware.ts`, `src/lib/supabase/*`, `src/lib/admin.ts` and migrations
> 0002 and 0008.

## 1. Provider and methods

Authentication is Supabase Auth. ParkSpace stores no password hash, issues no
token of its own and runs no session table. Two methods are offered, both on the
same form.

| Method | Supabase call | Default |
| --- | --- | --- |
| Magic link, email OTP | `signInWithOtp({ email, options: { emailRedirectTo, shouldCreateUser, data } })` | Yes |
| Password | `signInWithPassword({ email, password })` for sign in, `signUp({ email, password, options })` for registration | No, chosen by the user |

The magic link is the default deliberately. For a product someone uses a few
times a month, a link in the inbox beats a password they will not remember and
will reset every time, and it removes a whole class of credential-stuffing risk.
The password option exists because some people prefer it, and because the seeded
demo accounts cannot receive email and must sign in with a password.

`shouldCreateUser` is bound to the form mode: on the login form it is `false`, on
the register form it is `true`. That prevents the sign-in path from silently
creating an account for a mistyped address. Registration passes
`data: { full_name }` into `raw_user_meta_data`, which the profile
auto-provisioning trigger reads.

Minimum password length is enforced in the browser as `minLength={8}` and by
whatever Supabase project policy is configured. There is no application-level
password complexity rule.

## 2. The session cookie flow

```
 1. User submits the form in the browser
 2. supabase-js (browser client, anon key) calls the Supabase Auth API
 3. Magic link path:  email arrives → user clicks →
                      GET /auth/callback?code=…&next=/checkout/abc
                      exchangeCodeForSession(code) → cookies set on the response
    Password path:    tokens returned inline, supabase-js writes the cookies
 4. Every subsequent request carries sb-<ref>-auth-token cookies
 5. Edge middleware runs updateSession() on nearly every request:
       createServerClient(url, anonKey, { cookies: {getAll, setAll} })
       await supabase.auth.getUser()      ← verifies with the auth server
       rotated cookies are written onto the outgoing NextResponse
 6. Server Components and route handlers call createClient(), which reads the
    same cookies through next/headers and runs every query as that user
 7. Postgres evaluates auth.uid() from the JWT and applies RLS
```

Cookies are set by `@supabase/ssr`, which uses HTTP-only, `SameSite=Lax`,
`Secure` cookies in production. They are never read by application JavaScript.

### Why `getUser()` and not `getSession()`

`getSession()` reads the JWT out of the cookie and decodes it locally. It does
not verify the signature against the auth server, so it will happily return a
session object built from a forged or tampered cookie. `getUser()` makes a call
to the Supabase Auth server, which validates the token and returns the
authoritative user.

The codebase uses `getUser()` everywhere it matters. The comment in
`src/lib/supabase/middleware.ts` says it directly:

```ts
// getUser() rather than getSession(): getSession reads the cookie without
// verifying it, so it will happily return a forged session. getUser checks
// with the auth server.
```

Every API route opens with the same two lines. The one place `getSession()`
appears is `auth-form.tsx`, immediately after a successful `signUp()`, purely to
decide whether Supabase returned a session or requires email confirmation. It
grants nothing and gates nothing.

The cost of `getUser()` is a network round trip per request. It is paid
deliberately, because the alternative is a cheaper check that a forged cookie
passes.

## 3. The middleware refresh

`src/middleware.ts` runs on this matcher:

```
'/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|.*\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'
```

Static assets and image optimisation are excluded because they never need a
session and would only add latency.

It does two things.

**Refresh.** `updateSession()` constructs a server client whose `setAll` handler
writes rotated cookies onto a fresh `NextResponse`, then calls `getUser()`. This
is what keeps a long session alive. Without it, a Server Component reading an
expired access token would log the user out mid-session even though their refresh
token is still valid. Server Components cannot write cookies, which is precisely
why the refresh has to happen in middleware: `createClient()` in
`src/lib/supabase/server.ts` wraps its `cookieStore.set` calls in a `try/catch`
with a comment noting that the middleware refreshes the session instead, so the
read-only failure is safe to ignore.

**Route gating.** Three prefix groups:

| Group | Prefixes |
| --- | --- |
| Driver | `/bookings`, `/vehicles`, `/profile`, `/wallet`, `/checkout`, `/notifications` |
| Host | `/host` |
| Admin | `/admin` |

A request to any of these without a user is redirected to
`/auth/login?next=<path+search>`, so the round trip is invisible and the user
lands back where they were going.

Two honest points about this gating:

1. **It is not a security control.** The file says so: "The gating here is a
   redirect for the benefit of the user, not a security control… The actual
   protection is Row Level Security: even if this middleware were removed
   entirely, no data would leak." A signed-out person hitting `/host` should land
   on the sign-in page rather than an empty dashboard, and that is all this is
   for.
2. **It checks presence, not role.** The middleware treats `/admin` exactly like
   `/bookings`: any signed-in user passes. The role check for `/admin` happens in
   `src/app/admin/layout.tsx` via `requireRole(['admin','support'])`, and again
   in every admin API route via `requireAdmin(['admin'])`, and again in the
   database via `is_admin()` inside the RLS policies.

When `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing the
middleware passes straight through, so a fresh clone renders the landing page's
setup guide rather than a stack trace.

## 4. The auth callback and its open-redirect protection

`GET /auth/callback` is the landing point for magic links and email confirmation
links.

```ts
const rawNext = searchParams.get('next') ?? '/';
const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
```

Two conditions, and both are needed.

`startsWith('/')` rejects an absolute URL such as `https://evil.example.com`.
`!startsWith('//')` rejects a protocol-relative URL such as
`//evil.example.com`, which does begin with `/` and which a browser resolves
against the current scheme, landing the user on an attacker's host. Only the
second check catches that case, and omitting it is the classic way this
protection is written wrong.

The redirect is then built as `${origin}${next}`, where `origin` comes from
`request.nextUrl`, so the final destination is always same-origin by
construction.

The threat this defends against is specific. Without it, an attacker sends a
genuine ParkSpace magic-link URL whose `next` points at a page they control. The
victim sees a real ParkSpace domain in the link, clicks it, authenticates
legitimately, and is then handed to the attacker's page already primed to trust
whatever it shows. It is a phishing primitive, and the fix costs one line.

| Outcome | Behaviour |
| --- | --- |
| No `code` parameter | Redirect to `/auth/login?error=That link is missing its code. Request a new one.` |
| `exchangeCodeForSession` fails | Redirect to `/auth/login?error=That link has expired or has already been used. Request a new one.` |
| Success | Redirect to `${origin}${next}` with the session cookies set |

The login page reads `?error=` and passes it to `AuthForm` as `initialError`, so
the message is rendered in the form rather than lost.

## 5. Profile auto-provisioning

A trigger on `auth.users` guarantees that an authenticated user always has a
profile row.

```sql
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare code text;
begin
  loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from profiles p where p.referral_code = code);
  end loop;

  insert into profiles (id, email, full_name, phone, avatar_url, referral_code)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.phone, new.raw_user_meta_data->>'avatar_url', code)
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function handle_new_auth_user();
```

Four properties worth naming:

- `security definer` with a pinned `search_path`, because the trigger runs in the
  auth schema's context and must write into `public.profiles`.
- `profiles.id` is the same UUID as `auth.users.id`. That identity is what makes
  `id = auth.uid()` the correct policy expression everywhere.
- The referral code loop is collision-checked and bounded by the uniqueness of
  `gen_random_uuid()`, so it terminates.
- `on conflict (id) do nothing` makes the trigger idempotent, which matters
  because the seed script calls `auth.admin.createUser` and may race with it.

There is no code path that can produce an authenticated user without a profile.
Every RLS policy therefore has a row to match against, and `getCurrentProfile()`
can be relied on to return non-null for a real session.

## 6. The role model

Roles live on `profiles`, not in the JWT.

| Column | Type | Meaning |
| --- | --- | --- |
| `role` | `user_role` not null default `driver` | The **active** role, which drives the UI |
| `roles` | `user_role[]` not null default `{driver}` | The **set of granted** roles |

A check constraint binds them: `constraint profiles_role_in_roles check (role = any(roles))`.
The active role must be one the account actually holds.

| Role | Capability |
| --- | --- |
| `driver` | Search, book, pay, check in and out, review, raise disputes |
| `host` | List spaces, set availability and price, withdraw earnings |
| `operator` | Multi-location host. Treated as a host by the UI; no distinct capability is implemented |
| `admin` | Moderation, verification, refunds, disputes, configuration |
| `support` | Read-mostly admin plus dispute handling |

### Multi-role accounts

One account holds `driver` and `host` at the same time. This is the normal case,
not an edge case: the landing copy on the register page is literally "One account
books parking and lists it."

Promotion happens in `POST /api/host/spaces`. When a driver submits their first
listing, the route reads the current `role` and `roles`, and if the role is still
`driver` or `host` is absent from the array, it sets `role: 'host'` and appends
`'host'` to `roles`. It does this through the service client, because
`profiles.role` is one of the columns the privileged-column guard reverts.

The route comments are candid that this is best effort: the guard trigger exempts
only `is_full_admin()`, so on a database where the trigger fires for a
service-role session the promotion is silently reverted. The listing is created
either way and nothing the host can see depends on the promotion, but it is a
known rough edge.

The UI reads `role`, not `roles`. `src/components/user-menu.tsx` computes
`isHost = role === 'host' || role === 'operator'` and
`isAdmin = role === 'admin' || role === 'support'` to decide which menu links to
show. There is no role-switcher in this build, so a `host` whose active role is
`host` sees both the driver and host sections, but a driver who also holds
`host` in `roles` while `role` is still `driver` will not see the hosting link.

### The role check helpers

| Helper | Location | Use |
| --- | --- | --- |
| `requireRole(roles: string[])` | `src/lib/supabase/server.ts` | Page-level convenience. Returns `{ok, reason, profile}` where reason is `unauthenticated`, `suspended` or `forbidden`. The doc comment states plainly that this is **not** the security boundary: "If this check were the only thing standing between a driver and the admin panel, a missing policy would be an incident." |
| `requireAdmin(tiers)` | `src/lib/admin.ts` | The admin API gate. Returns the service client **only on the success branch**, so there is no way to hold a privilege-bypassing client before the caller has been identified as an admin. Ordering is enforced by the shape of the return type, not by discipline. |
| `is_admin()`, `is_full_admin()` | migration 0008 | `SECURITY DEFINER` SQL predicates used inside RLS policies and the `public_spaces` view. `is_admin()` accepts `admin` or `support`; `is_full_admin()` accepts only `admin` |

The tiering is real: moderation and suspension both call `requireAdmin(['admin'])`,
so support can read the queues but does not decide what goes live or who is
suspended.

## 7. How RLS binds to `auth.uid()`

Supabase sets the request's JWT claims on the Postgres connection, and
`auth.uid()` returns the `sub` claim as a UUID. Because `profiles.id` is that
same UUID, every policy is a direct comparison.

| Pattern | Example policy |
| --- | --- |
| Own row | `profiles_select_self`: `using (id = auth.uid() or is_admin())` |
| Owned collection | `vehicles_owner_all`: `using (owner_id = auth.uid()) with check (owner_id = auth.uid())` |
| Participant | `bookings_participant_read`: `using (driver_id = auth.uid() or host_id = auth.uid() or is_admin())` |
| Transitive | `space_photos_read`: exists a parking space whose `status = 'active'` or whose `host_id = auth.uid()` |
| Relationship-gated | `vehicles_host_read_booked`: a host may read the make, model and plate of a vehicle booked into their own space, because that is how they identify the car at the gate. Scoped to a live booking rather than blanket access |
| Time-gated | `has_address_access(space_id)`: driver, confirmed or later, and `now() >= starts_at - interval '24 hours'` |
| Closed | `bookings_no_direct_insert`: `with check (is_full_admin())`. Inserts go exclusively through `create_booking_hold` |

Twenty-six tables have RLS enabled. A `SECURITY DEFINER` function such as
`create_booking_hold` runs with the definer's rights and so can write rows the
caller could not write directly, which is exactly why those functions read
`auth.uid()` themselves and check ownership in their own bodies rather than
trusting the caller.

## 8. Privileged-column guard triggers

RLS policies gate rows, not columns. A user who is permitted to update their own
`profiles` row is, as far as a policy is concerned, permitted to update every
column in it, including `role`, `wallet_balance_paise` and `is_suspended`. Three
`before update` triggers close that gap by reverting the columns rather than
rejecting the statement.

| Trigger | Table | Exempt when | Reverted columns |
| --- | --- | --- | --- |
| `profiles_guard_privileged` | `profiles` | `is_full_admin()` | `role`, `roles`, `verification`, `trust_score`, `wallet_balance_paise`, `bookings_completed`, `bookings_cancelled`, `is_suspended`, `suspended_reason`, `referral_code`, `referred_by` |
| `host_profiles_guard` | `host_profiles` | `is_full_admin()` | `kyc_status`, `kyc_reviewed_at`, `kyc_reviewer_id`, `is_superhost`, `superhost_since`, `total_earnings_paise`, `payable_balance_paise`, `response_rate_bp`, `acceptance_rate_bp` |
| `spaces_guard` | `parking_spaces` | `is_admin()` | `avg_rating`, `review_count`, `booking_count`, `popularity_score`, `reviewed_by`, `reviewed_at`, `rejection_reason`. Additionally **raises** `check_violation` if a non-admin moves a listing to `active` from anything other than `active` or `paused`, or sets `rejected` at all |
| `bookings_guard_direct` | `bookings` | `is_admin()` | Raises `insufficient_privilege` on any status change, and reverts `base_amount_paise`, `discount_amount_paise`, `wallet_applied_paise`, `service_fee_paise`, `tax_amount_paise`, `total_amount_paise`, `host_commission_paise`, `host_payout_paise`, `refund_amount_paise`, `overstay_amount_paise`, `starts_at`, `ends_at`, `bay_index`, `qr_token`, `checked_in_at`, `checked_out_at` |

Reverting rather than rejecting is a deliberate usability choice: a host who
PATCHes a whole listing object including `avg_rating` gets a successful update of
the fields they are allowed to change, instead of an error about a field they
never intended to set. The two cases that **do** raise are the two where silent
reversion would be misleading: self-approving a listing, and changing a booking's
status.

Note that `spaces_guard` exempts `is_admin()`, which includes `support`, while
the moderation API route is gated to `admin` only. The database is one tier more
permissive than the route here.

## 9. Account enumeration in the error copy

A sign-in form that distinguishes "no such account" from "wrong password" is an
oracle: an attacker feeds it a list of email addresses and learns which ones are
registered, which is directly useful for credential stuffing and for targeted
phishing. `auth-form.tsx` addresses this in its mapping of provider messages to
user copy.

| Provider message pattern | Copy shown |
| --- | --- |
| `/invalid login credentials/i` | "Those details did not work. Check the email and password and try again." |
| `/rate limit\|too many/i` | "Too many attempts. Wait a minute and try again." |
| `/already registered/i` | "That email is already in use. Try signing in instead." |
| anything else | The raw provider message |

The first row is the deliberate one: the copy does not say whether the account
exists. The file comment states the intent, "because the latter turns the sign-in
form into an account enumeration oracle."

Two honest caveats about how complete this is.

1. **The registration path still discloses.** "That email is already in use"
   confirms registration for that address. This is the standard trade-off: the
   alternative is to accept every registration silently and send a "someone tried
   to register with your address" email, which is better practice and is not
   implemented here.
2. **The magic-link path leaks by timing and by outcome.** With
   `shouldCreateUser: false` on the login form, requesting a link for an
   unregistered address behaves differently from a registered one. The success
   screen is identical either way, which is the right shape, but Supabase's own
   response for a non-existent user may differ and the fallback branch shows the
   raw provider message.

The magic-link success screen is deliberately identical regardless of outcome:
"We sent a sign-in link to `<email>`. It is good for one hour. You can close this
tab."

Supabase applies its own rate limiting on OTP sends. The `LIMITS.auth` class,
6 requests per minute, is defined in `src/lib/rate-limit.ts` but is not applied
to any route in this build, because sign-in goes directly from the browser to
Supabase Auth and never passes through a ParkSpace route handler.

## 10. Suspension

`profiles.is_suspended` is checked in three places:

| Where | Effect |
| --- | --- |
| `create_booking_hold` | Returns `ACCOUNT_SUSPENDED` before doing any other work |
| `requireRole` and `requireAdmin` | Return `reason: 'suspended'` / `AppError('ACCOUNT_SUSPENDED')` |
| The `public_profiles` view | `where not p.is_suspended`, so a suspended account disappears from host cards and review author lines |

Suspension does not revoke the Supabase session. A suspended user remains signed
in and can still read their own data; they simply cannot make bookings, cannot
reach the admin panel, and are hidden from the public. Forcing a sign-out would
require calling the Supabase admin API to revoke refresh tokens, which this build
does not do.

## 11. Sign out

`user-menu.tsx` calls `supabase.auth.signOut()` on the browser client, which
clears the cookies, then navigates. There is no server-side session to
invalidate.

## 12. What is not implemented

| Item | Status |
| --- | --- |
| Phone or SMS OTP | `profiles.phone` and `phone_verified_at` exist. No verification flow |
| Social sign-in | Not configured. `raw_user_meta_data->>'avatar_url'` is read by the provisioning trigger, so adding a provider would populate avatars without a schema change |
| Two-factor authentication | Not implemented, for admins or anyone else |
| Password reset | Not implemented as a route. Supabase's own reset email flow would land on `/auth/callback`, which handles it correctly, but there is no "forgot password" link on the form |
| Email verification enforcement | `EMAIL_NOT_VERIFIED` exists in `AppErrorCode` and is never raised. Whether confirmation is required is a Supabase project setting, not an application rule |
| Session revocation on suspension | Not implemented, see section 10 |
| Role switching in the UI | Not implemented. `roles` is stored but only `role` is read |
