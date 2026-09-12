# 27. Deployment Strategy

> The commands in this document are the ones that exist in `package.json` and
> `scripts/`. Where a documented command is broken, that is stated rather than
> smoothed over. Section 10 is the credential hygiene section and it is not
> optional reading.

## 1. The platform

| Layer | Service | Tier | Cost |
| --- | --- | --- | --- |
| Application | Vercel, Next.js 15 App Router | Hobby or Pro | Free on Hobby |
| Database, Auth, Storage | Supabase | Free or Pro | Free tier sufficient for launch |
| Maps and tiles | OpenStreetMap raster, Carto light | Public | Free, with an attribution obligation |
| Geocoding | Nominatim, proxied | Public | Free, with a usage policy obligation |
| Payments | Mock, or Razorpay | Razorpay test mode | Free until live |
| Scheduler | Vercel Cron | Included | Free |

Node 20 or later is required (`engines.node: ">=20.0.0"`).

## 2. First deployment, step by step

### Step 1: create the Supabase project

1. Create a project at `https://supabase.com/dashboard`. Choose a region close
   to the users; for a Kolkata launch that is Singapore or Mumbai.
2. Record the database password shown once at creation. It is not recoverable.
3. Open **Project Settings, API** and copy three values:

| Value | Environment variable | Safe in a browser |
| --- | --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes, every table it reaches is protected by RLS |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` | **no, it bypasses every RLS policy** |

### Step 2: configure the environment locally

```bash
cp .env.example .env.local
```

Fill in the three Supabase values plus `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
`.env.local` is git-ignored, and section 10 explains why that must stay true from
the very first commit.

### Step 3: apply the migrations

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...     # PowerShell: $env:SUPABASE_ACCESS_TOKEN="sbp_..."
npm run db:push
```

`scripts/db-push.mjs` talks to the Supabase Management API at
`https://api.supabase.com/v1/projects/{ref}/database/query`. It deliberately has
no dependencies beyond Node itself, so it works without the Supabase CLI, without
Docker and without a local Postgres.

The personal access token comes from
`https://supabase.com/dashboard/account/tokens`. The project ref is parsed out of
`NEXT_PUBLIC_SUPABASE_URL`, or passed with `--project-ref`.

What it does:

1. Creates `_parkspace_migrations (name text primary key, applied_at timestamptz)`.
2. Reads the applied set.
3. Applies each `.sql` file in `supabase/migrations/` in filename order, skipping
   any already recorded. Running it twice is safe.
4. On failure it stops, prints the file and the error, and applies nothing after
   it. Files that already succeeded are skipped on the next run.
5. Finally runs `supabase/seed/seed.sql` unless `--no-seed` is passed. A seed
   failure is reported and does not fail the push.

Expected output:

```
Applying migrations to project abcdefghijklm

  apply  0001_extensions_and_enums.sql ... done
  apply  0002_identity.sql ... done
  ...
  apply  0009_refund_split.sql ... done
  seed   seed.sql ... done

9 migrations applied, 0 already present.
```

**Note a discrepancy in `.env.example`:** it documents `SUPABASE_DB_PASSWORD` as
"used only by `npm run db:push`". The script does not read that variable. It
reads `SUPABASE_ACCESS_TOKEN`. Use the access token.

### Step 4: seed the demo data

```bash
npm run db:seed
```

`scripts/db-seed.mjs` uses the service role key, which bypasses RLS. That is
correct here and nowhere else in the product. It creates real Supabase Auth users
so the whole flow can be exercised, and is safe to re-run: existing demo users
are reused rather than duplicated.

It creates five hosts with six listings across real Kolkata coordinates (Park
Street, Esplanade, Ballygunge, Salt Lake Sector V, Dum Dum Airport), two drivers
with vehicles, and one admin. The shared password is printed at the end.

Sign in with the **password** option, not the magic link: these addresses do not
receive email.

### Step 5: local verification

```bash
npm install
npm run verify      # tsc --noEmit && vitest run
npm run dev
```

`npm run verify` must pass before anything is deployed. It is also the check
`scripts/deploy.mjs` runs as a precondition.

### Step 6: deploy to Vercel

Either the guided script:

```bash
node scripts/deploy.mjs --check    # preflight only
node scripts/deploy.mjs            # interactive push and deploy
```

or manually at `https://vercel.com/new`. Import the repository; Vercel detects
Next.js and the build settings need no changes. Set the environment variables
listed in section 3 **before** the first deploy.

`scripts/deploy.mjs --check` verifies: inside a git repository, a clean working
tree, an `origin` remote, **no `.env` or secret file tracked by git**, `.env.local`
present with the three Supabase values filled in and not still `your-...`,
Razorpay keys present if `PAYMENT_PROVIDER=razorpay`, a warning if `CRON_SECRET`
is unset, and finally `tsc --noEmit` and `vitest run`.

It deliberately does **not** accept tokens as command-line arguments, because
arguments end up in shell history and in the process list where other users on
the machine can read them. It reads them from the environment or from an
interactive prompt with the input hidden.

### Step 7: after the first deploy

1. Set `NEXT_PUBLIC_SITE_URL` to the real domain and redeploy, so auth redirects
   and the sitemap point at the right place.
2. In Supabase, **Authentication, URL Configuration**, add the domain to the
   redirect allowlist. **Magic links will not work until you do**, and the
   failure mode is an expired-link error that gives no hint of the cause.
3. Confirm the cron is running: Vercel project, Settings, Cron Jobs. Without it,
   expired holds never release their bays and the marketplace slowly seizes.
4. If a real gateway is configured, point its webhook at
   `https://your-domain/api/payments/webhook`.

### Step 8: the payment webhook

In the Razorpay dashboard, Settings, Webhooks:

| Field | Value |
| --- | --- |
| URL | `https://your-domain/api/payments/webhook` |
| Secret | A generated value, also set as `RAZORPAY_WEBHOOK_SECRET` |
| Events | `payment.captured`, `payment.failed`, `payment.authorized` |

Test the endpoint before switching off mock. A webhook that is not reaching us is
indistinguishable, from the driver's side, from a payment that did not go
through.

**Before switching to Razorpay, fix the CSP.** `next.config.mjs` has
`script-src 'self' 'unsafe-inline' 'unsafe-eval'` and the checkout client injects
`https://checkout.razorpay.com/v1/checkout.js`. Under the configured CSP that
script is blocked and the payment sheet never opens. Add
`https://checkout.razorpay.com` to `script-src` and `https://api.razorpay.com` to
`connect-src`.

## 3. Environments

| | Local | Preview | Production |
| --- | --- | --- | --- |
| Host | `localhost:3000` | Vercel preview URL per branch | Vercel production domain |
| Supabase project | Shared dev project | **Should be its own project** | Its own project |
| `PAYMENT_PROVIDER` | `mock` | `mock` | `razorpay` |
| `ALLOW_MOCK_PAYMENTS` | unset | `true` if the preview must demo payments | **unset, always** |
| `CRON_SECRET` | optional | set | **required**, the route returns 503 without it |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | the preview URL | the real domain |
| Seed data | yes | yes | **never** |
| Cron | not running | Vercel runs cron on production deployments only | every 5 minutes |

Two warnings about environments:

- Vercel preview deployments inherit production environment variables unless
  scoped. If a preview points at the production Supabase project, a test booking
  is a production booking. Scope every variable to the environments it belongs
  in.
- `MockPaymentProvider` throws at construction when `NODE_ENV === 'production'`
  and `ALLOW_MOCK_PAYMENTS !== 'true'`. That guard is the last line of defence
  against a deployment that confirms bookings without taking money, and it should
  never be disabled on the real domain.

### Environment variables

| Variable | Required | Scope | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | all | Browser-visible |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | all | Browser-visible, safe |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server | **Never** prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | yes | all | Auth redirects, sitemap, the mock webhook self-call |
| `CRON_SECRET` | production | server | Without it `/api/cron` refuses to run in production |
| `NOMINATIM_USER_AGENT` | recommended | server | Must carry a real contact address. The Nominatim policy requires it |
| `PAYMENT_PROVIDER` | yes | server | `mock` or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | if razorpay | server | Missing credentials cause a silent fallback to mock with a console warning |
| `MOCK_PAYMENT_SECRET` | no | server | Changes the mock's HMAC key |
| `ALLOW_MOCK_PAYMENTS` | no | server | See above |
| `NEXT_PUBLIC_DEFAULT_CITY`, `_LAT`, `_LNG` | no | all | Default map centre, Kolkata |

`src/lib/env.ts` validates all of these with Zod and fails loudly at the point of
use with a message naming the missing variable and where to get it, rather than
producing an `undefined` that surfaces later as an unrelated runtime error.
`serverEnv()` throws immediately if evaluated in a browser bundle.

## 4. The cron schedule

From `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron", "schedule": "*/5 * * * *" }]
}
```

Every five minutes, 288 invocations per day. Vercel sends
`Authorization: Bearer <CRON_SECRET>` automatically when the variable is set, and
the route compares it character by character with no early return on a length
mismatch.

| Step | Effect | Consequence if it stops |
| --- | --- | --- |
| 1 | `expire_stale_holds()` | **Bays stay held forever.** Inventory silently disappears. The most damaging failure of the six |
| 2 | `auto_complete_stale_bookings()` | Active bookings hold their bay indefinitely; no-shows are never recorded |
| 3 | Publish reviews past `REVIEW_WINDOW_DAYS` | Unpaired reviews stay hidden |
| 4 | `refresh_superhost_badges()` | Badges go stale |
| 5 | Mark due notifications as sent | Nothing, because nothing is delivered anyway. See `16_Notification_Specification.md` |
| 6 | Count payable bookings | Reporting only |

`maxDuration` is 60 seconds. Each step is individually try-caught, so one failure
does not stop the rest, and the route returns 200 with per-step outcomes even
when a step errored. That means **a 200 response does not mean success**, and
monitoring must parse the body, not the status.

Note that Vercel Hobby limits cron to once per day. `*/5` requires a Pro plan. On
Hobby, an external scheduler (GitHub Actions on a schedule, `cron-job.org`)
hitting the URL with the bearer token is the workaround, and it must be set up
deliberately rather than assumed.

## 5. Database migrations in production

`npm run db:push` is safe to run against production: migrations are tracked in
`_parkspace_migrations` and already-applied files are skipped.

### The backwards-compatible rule

**Every migration must be safe to run while the previous version of the
application is still serving traffic.**

Vercel does not stop the old deployment before the new one starts. For a period
measured in seconds to minutes, old code and new schema coexist. A migration that
breaks the old code takes the site down during its own deployment.

| Safe in one step | Requires the expand-contract pattern |
| --- | --- |
| `add column ... null` or with a default | `drop column` |
| `create index concurrently` | `rename column` |
| `create table` | Narrowing a type or adding `not null` to an existing column |
| `create or replace function`, when the signature is unchanged | Changing a function's parameter list, which creates an overload |
| Adding an enum value (`alter type ... add value`) | Removing an enum value, which Postgres does not support at all |
| Adding a permissive RLS policy | Tightening a policy that old code depends on |
| Adding a check constraint `not valid`, then validating | Adding a check constraint that existing rows violate |

**Expand and contract**, for a column rename as the worked example:

```
Deploy 1 (expand):   add the new column, backfill it, dual-write from the app
Deploy 2 (migrate):  read from the new column, keep writing both
Deploy 3 (contract): stop writing the old column
Deploy 4 (drop):     drop the old column
```

Four deploys instead of one, and no downtime. Ordering matters in one more way:
**migrate before deploying code that needs the new schema, and deploy code that
stops using a column before dropping it.**

Two ParkSpace-specific cautions:

- `alter type ... add value` cannot run inside a transaction block in older
  Postgres versions, and a new enum value is not usable in the same transaction
  that adds it. Put it in its own migration file.
- Dropping or recreating `bookings_no_overlap` takes an `ACCESS EXCLUSIVE` lock
  on `bookings` and will rebuild the GiST index. On a large table that is a real
  outage window. Do not touch it casually, and if you must, do it in a
  maintenance window with `create index concurrently` where possible.

Migrations are never edited after being applied. `_parkspace_migrations` keys on
the filename, so an edited file is silently skipped and production diverges from
the repository. Fix forward with a new file.

## 6. Backup and restore

### What Supabase provides

| Tier | Backup | Retention | PITR |
| --- | --- | --- | --- |
| Free | Daily logical backup | 7 days | no |
| Pro | Daily physical backup | 7 days | **Point-in-time recovery, 7 days, purchasable to 28** |

**Enable PITR before taking real bookings.** Without it, the recovery granularity
is 24 hours, which for a system holding money and reservations is not acceptable.

### Targets

| Metric | Target | Justification |
| --- | --- | --- |
| **RPO** (maximum data loss) | **5 minutes** with PITR | Bookings and payments are created continuously. Losing an hour means drivers arriving at spaces the database no longer knows are booked |
| **RTO** (time to restore) | **1 hour** for the database, **15 minutes** for the application | A Supabase restore into a new project plus an environment variable change and a redeploy |
| RPO without PITR | 24 hours | The reason PITR is mandatory before launch |

### Additional backup, because the platform's own is not enough

A weekly `pg_dump` to storage outside Supabase. The failure mode this protects
against is the account-level one: a compromised or suspended Supabase account
takes the backups with it.

```bash
pg_dump "postgresql://postgres:$PW@db.<ref>.supabase.co:5432/postgres" \
  --no-owner --no-acl --format=custom --file="parkspace-$(date +%F).dump"
```

Encrypt at rest, store in a different provider, and retain: daily for 7 days,
weekly for 4 weeks, monthly for 12 months.

### Restore drill

**A backup that has never been restored is not a backup.** Quarterly, restore the
most recent dump into a scratch project and verify:

1. All nine migrations are recorded in `_parkspace_migrations`.
2. `select count(*) from bookings where status in ('confirmed','active')` matches
   expectation.
3. **The exclusion constraint exists and works.** Attempt an overlapping insert
   and confirm `23P01`. A restore that silently dropped the constraint is worse
   than no restore, because the product would appear to work while quietly
   double-booking.
4. RLS is enabled on all 26 tables:
   `select relname from pg_class where relrowsecurity = false and relnamespace = 'public'::regnamespace and relkind = 'r'`.
5. `select * from public_spaces limit 1` as an anon role returns null for
   `address_line`.
6. Record the wall-clock time. That number is the real RTO.

## 7. Monitoring, and what must alert

### Must page a human immediately

| Condition | Why |
| --- | --- |
| Log contains `PAYMENT TAKEN BUT BOOKING NOT CONFIRMED` | Money was taken for a booking that does not exist. A driver will arrive at a space that is not theirs, or will have paid for nothing. This string is emitted by the webhook handler specifically so it can be alerted on |
| `webhook_events` rows with `processing_error is not null` in the last 15 minutes | Every one is a payment that did not complete its side effects |
| `webhook_events` rows with `signature_valid = false` above a low threshold | Either a misconfigured secret or someone probing the endpoint |
| `/api/payments/webhook` error rate above 1 percent | The gateway cannot confirm anything |
| Cron has not run in 15 minutes | Holds are not expiring, inventory is disappearing |
| Cron body contains any `"error: ..."` string | A step failed while the response was still 200 |
| Database connections above 80 percent of the pool | Supabase free and Pro both have hard connection limits |
| Any 5xx above 1 percent of requests | |

### Must alert during business hours

| Condition |
| --- |
| `bookings where status='pending' and hold_expires_at < now() - interval '30 minutes'` is non-empty, meaning the sweeper is running but not sweeping |
| `refunds where status='requested' and created_at < now() - interval '24 hours'`. **Given that nothing processes refunds in this build, this alert will fire for every refund** and is the operational marker of that gap |
| `parking_spaces where status='pending_review'` older than 24 hours: the moderation queue is backing up |
| `disputes where priority=0 and status in ('open','investigating')` older than 1 hour |
| p95 latency on `/api/search` above 1 second |
| Nominatim returning 429 or 403: the usage policy is being breached |

### Business dashboards, reviewed weekly

Successfully completed parking hours per week (the North Star), zero-result
search count and its top clusters (the supply gap screen in the admin panel),
hold-to-confirmation conversion rate, cancellation rate by policy, and GMV
against platform revenue.

### Tooling

Vercel provides function logs, invocation counts and per-route latency. Supabase
provides query performance and connection counts. Neither alerts by default.
Sentry's free tier covers error aggregation and is the smallest addition that
closes the "nobody was watching" gap. A log drain to any provider that supports
a text-match alert is what makes the "PAYMENT TAKEN" alert possible.

## 8. Rollback

### Application rollback, the fast path

Vercel keeps every deployment. Promote the previous one:

Dashboard, Deployments, find the last good one, Promote to Production. Or
`vercel rollback <deployment-url>`. Takes seconds and needs no rebuild.

This is always safe **when no migration accompanied the deploy**, which is the
reason the backwards-compatible rule in section 5 exists: it keeps this path open.

### With a migration involved

| Situation | Action |
| --- | --- |
| The migration was additive (new column, new index, new function) | Roll back the application only. The extra schema is inert |
| The migration was destructive | Do **not** roll the schema back. Fix forward with a new migration. Reversing a destructive change loses whatever was written since |
| The migration corrupted data | PITR restore to the instant before it ran, accepting the loss of everything since. This is the scenario RPO is defined for |

### Rollback checklist

1. Confirm the symptom is real: error rate, a specific log line, a user report.
2. Identify the last known-good deployment by commit SHA.
3. Promote it.
4. Verify: load the site, run a search, open a booking.
5. Check whether a migration shipped with the bad deploy. If so, apply the table
   above.
6. Write the incident note **before** investigating: what broke, when, what was
   done. Memory degrades within the hour.
7. Fix forward on a branch. Never re-promote the bad deployment to "test the
   fix".

## 9. Pre-launch checklist

### Infrastructure

- [ ] Supabase production project, separate from dev, in an Indian or Singapore region
- [ ] All nine migrations applied; `_parkspace_migrations` has nine rows
- [ ] **Seed data NOT applied to production**
- [ ] PITR enabled
- [ ] An off-platform `pg_dump` scheduled and one restore drill completed
- [ ] Vercel project on a plan that permits a 5-minute cron, or an external scheduler configured
- [ ] Custom domain with TLS; HSTS is already set with `preload`
- [ ] Environment variables scoped per environment, with no production secret reachable from a preview

### Security

- [ ] `SUPABASE_SERVICE_ROLE_KEY` set server-side only and never under a `NEXT_PUBLIC_` name
- [ ] `CRON_SECRET` set, 32 random bytes, and `/api/cron` returns 401 without it
- [ ] `ALLOW_MOCK_PAYMENTS` unset in production
- [ ] `PAYMENT_PROVIDER=razorpay` with live credentials
- [ ] CSP updated for `checkout.razorpay.com` and `api.razorpay.com`
- [ ] RLS confirmed enabled on all 26 tables in the production database
- [ ] `select address_line from parking_spaces` as the `authenticated` role is refused
- [ ] Supabase Auth redirect allowlist contains the production domain
- [ ] No `.env` file tracked by git: `git ls-files | grep -E '\.env($|\.)'` returns nothing except `.env.example`

### Application

- [ ] `npm run verify` passes
- [ ] `node scripts/deploy.mjs --check` passes
- [ ] The full booking loop exercised on production with a real Rs 1 payment, then refunded manually
- [ ] Magic link sign-in works on the production domain
- [ ] The cron has run and its response body contains no `error:` strings
- [ ] `NOMINATIM_USER_AGENT` carries a real contact address
- [ ] OpenStreetMap attribution is visible on every map

### Known gaps acknowledged in writing before launch

These are not blockers by default, but launching without a decision on each is a
decision by omission.

- [ ] **Refunds are recorded and not issued.** Someone is assigned to process
      `refunds where status='requested'` manually
- [ ] **Payouts do not exist.** Someone is assigned to pay hosts manually from
      `host_profiles.payable_balance_paise`
- [ ] **No notification is delivered.** Drivers receive no reminder of any kind
- [ ] **The rate limiter is per instance** and does not protect `/api/search` or
      `/api/geocode` at all
- [ ] **Disputes cannot be raised** from the product
- [ ] The commercial questions in `15_Payment_Specification.md` section 10 have
      been put to a chartered accountant and a payments lawyer

## 10. Credential hygiene: the incident pattern

This section exists because the most common way a small product leaks its
database is not an exploit. It is a token pasted where it should not have been.

### The pattern

A developer needs help. They paste a command, a config file or a screenshot into
a chat, an issue, a support ticket or an AI assistant. The paste includes a
token. The token is now in a log, an index, a backup and a training corpus, and
it cannot be recalled. Alternatively, a `.env` file is committed once, noticed,
and deleted in the next commit, and the secret remains in the git history and in
every clone and fork forever.

The severity here is total: `SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy
in the database. Whoever holds it can read every user's address, phone number,
booking history and payment record, and can write anything.

### The rules

1. **Never paste a token into any chat, issue, pull request, screenshot or
   terminal recording.** Not redacted, not partially, not "just the first few
   characters".
2. **Never commit a `.env` file.** `.gitignore` excludes `.env`, `.env*.local`,
   `.env.local`, `.env.development.local`, `.env.test.local`,
   `.env.production.local`, `.secrets.env` and `*.secrets`, and has done from the
   first commit. `.env.example` is committed and contains only placeholders.
3. **Never pass a secret as a command-line argument.** Arguments appear in shell
   history and in `ps` output. `scripts/deploy.mjs` refuses to accept tokens as
   arguments for exactly this reason and prompts with the input hidden instead.
4. **Never log a secret**, even at debug level. Logs are retained, shipped and
   searched.
5. **Assume any secret that has been on a screen shared with anyone is
   compromised.** Rotate it.
6. **`scripts/deploy.mjs --check` fails the build** if git is tracking any file
   matching `/(^|\/)\.env($|\.)|\.secrets|service[-_]role/i`, excluding
   `.env.example`. Run it before every deploy.

### Rotation procedures

Rotate on any suspicion. Rotation is cheap; a breach is not.

**GitHub personal access token**

1. `https://github.com/settings/tokens`, delete the token.
2. Create a replacement with the narrowest scope that works. For pushing to one
   repository, a fine-grained token scoped to that repository with Contents:
   read and write is enough. Classic `repo` scope is almost always too broad.
3. Set an expiry. 90 days maximum.
4. Update wherever it was stored: `git credential-manager`, a CI secret, a
   password manager.
5. Check `https://github.com/settings/security-log` for anything the old token
   did that you did not do.

**Vercel token**

1. `https://vercel.com/account/tokens`, delete it.
2. Create a replacement scoped to the one project and with an expiry.
3. Prefer `vercel login` for interactive use. `scripts/deploy.mjs` says so
   directly: it is easier than a token and leaves nothing behind.
4. Review the project's deployment history for anything unexpected.

**Supabase personal access token** (the one `db:push` uses)

1. `https://supabase.com/dashboard/account/tokens`, revoke it.
2. Generate a replacement and store it in the environment, not in a file.
3. This token can run arbitrary SQL against every project on the account, so it
   is at least as sensitive as the service role key.

**Supabase service role key** (the most severe)

1. Supabase dashboard, **Project Settings, API, Reset service role key**. This
   invalidates the old key immediately.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel for every environment.
3. **Redeploy.** Vercel bakes environment variables at build time for some
   surfaces; a variable change without a redeploy leaves the old value running.
4. Verify the webhook and the cron still work. Both fail closed without a valid
   key, which is the correct behaviour and also means a botched rotation is
   immediately visible.
5. Review the Supabase logs for queries made with the old key during the exposure
   window.
6. If exposure is confirmed rather than suspected, treat it as a data breach:
   determine what was accessible (which is everything), consider notification
   obligations under the Digital Personal Data Protection Act 2023, and record
   the timeline.

Note that resetting the service role key on Supabase also rotates the JWT secret
on some project configurations, which invalidates every existing user session.
Plan for users being signed out.

**Razorpay keys**

1. Dashboard, Settings, API Keys, regenerate. The old key stops working
   immediately, so there is a brief window where payments fail. Do it at low
   traffic.
2. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, redeploy.
3. Regenerate the webhook secret separately and update
   `RAZORPAY_WEBHOOK_SECRET`. Until both sides match, every webhook is rejected
   as `SIGNATURE_INVALID`, which means bookings will be paid for and not
   confirmed. Have the reconciliation query ready before you start.

**Cron secret**

1. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Update `CRON_SECRET` in Vercel and redeploy. Vercel Cron reads the variable
   at invocation, so no further configuration is needed.

### If a secret has already been committed

Deleting the file in a later commit does **not** remove it from history.

1. **Rotate first.** Cleaning history takes time; the key is live the whole while.
2. Then rewrite history with `git filter-repo` (not `filter-branch`), or BFG
   Repo-Cleaner.
3. Force-push every branch and tag, and tell every collaborator to re-clone. A
   stale clone still contains the secret.
4. On GitHub, open a support request to purge cached views: forks and the API can
   serve the old blob even after a force-push.
5. If the repository was ever public, treat the secret as compromised regardless
   of how quickly it was removed. Automated scanners find committed keys within
   minutes.

## 11. Known deployment issues in this repository

| Issue | Detail | Fix |
| --- | --- | --- |
| `npm run setup` is broken | `package.json` declares `"setup": "node scripts/setup.mjs"` and that file does not exist. `scripts/` contains `db-push.mjs`, `db-seed.mjs` and `deploy.mjs` only | Remove the script entry, or add the file |
| `.env.example` documents `SUPABASE_DB_PASSWORD` for `db:push` | The script reads `SUPABASE_ACCESS_TOKEN` instead | Correct the comment |
| `.env.example` omits `NEXT_PUBLIC_MAP_STYLE` | `env.ts` defines it with a default, so nothing breaks | Add it for completeness |
| CSP blocks the Razorpay checkout script | See section 2, step 8 | Add the two hosts before switching provider |
| Vercel Hobby cannot run a 5-minute cron | `vercel.json` specifies `*/5 * * * *` | Pro plan, or an external scheduler |
| Vercel preview deployments inherit production variables by default | A preview could write to the production database | Scope every variable per environment |
