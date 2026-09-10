# 15. Payment Specification

> Implemented in `src/lib/payments/{types,mock,razorpay,index}.ts`,
> `src/app/api/payments/{create,webhook,mock-complete}/route.ts`,
> `src/lib/money.ts`, and migrations 0005, 0007 and 0009. Section 10 lists the
> commercial questions that are **not** settled and must be before this handles
> real money.

## 1. The provider abstraction

One interface, two implementations, one environment variable to switch.

```ts
export interface PaymentProvider {
  readonly name: ProviderName;                        // 'mock' | 'razorpay'
  readonly isConfigured: boolean;

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  verifyWebhook(input: VerifyCallbackInput): VerifiedEvent | null;
  verifyClientCallback(fields: Record<string, string>): boolean;
  refund(input: RefundInput): Promise<RefundResult>;
}
```

The contract is deliberately narrower than what a gateway offers. It models what
a marketplace actually needs: create an intent, verify that a callback really
came from the provider, and refund. Subscriptions, saved instruments, split
settlements, tokenisation and payment links are not modelled, because nothing in
this product uses them and an interface that anticipates everything ends up
committing to the wrong abstraction.

Three details in the contract carry weight:

| Detail | Why |
| --- | --- |
| `verifyWebhook` takes `rawBody: string` | Signature checks run over bytes, not over a re-serialised object. Parsing first and re-encoding changes key order and whitespace, and the HMAC will not match |
| `verifyWebhook` returns `VerifiedEvent \| null`, never throws | The caller records the failed attempt and answers 400 without leaking whether the secret was close |
| `verifyClientCallback` is separate from `verifyWebhook` | They are not interchangeable. Section 4 |

`getPaymentProvider()` caches a singleton. When `PAYMENT_PROVIDER=razorpay` but
the credentials are missing it logs a warning and falls back to the mock, rather
than failing at the moment a user tries to pay. A half-configured gateway
discovered at checkout is a far worse failure than one discovered at boot.
`resetPaymentProvider()` exists to clear the singleton between tests.

## 2. The mock provider, and why it signs properly

The mock exists so a fresh clone can run the complete booking loop, including the
webhook path and refunds, with no merchant account and no keys.

It is **not** a stub that returns success unconditionally. It signs its callbacks
with HMAC-SHA256 exactly as a real gateway does:

```ts
const MOCK_SECRET = process.env.MOCK_PAYMENT_SECRET ?? 'parkspace-development-only-mock-secret';
function sign(payload: string): string {
  return crypto.createHmac('sha256', MOCK_SECRET).update(payload).digest('hex');
}
```

and verifies with `crypto.timingSafeEqual` after a length check, which is
constant-time comparison. That is overkill for a mock, and that is exactly the
point: the verification code that runs in production is the same code exercised
on a laptop. A signature bug shows up on the developer's machine rather than on
the first real payment.

The event body it builds mirrors Razorpay's shape: a top-level `id`, `event`,
`created_at`, and `payload.payment` carrying `id`, `order_id`, `amount`,
`currency`, `method`, `status`, `error_code` and `error_description`. So the
webhook handler's parsing, deduplication and amount-comparison logic is exercised
against a realistic payload rather than a convenient one.

`POST /api/payments/mock-complete` calls **our own webhook over HTTP**:

```ts
const webhookResponse = await fetch(`${siteUrl}/api/payments/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-parkspace-mock-signature': signature },
  body: eventBody,
});
```

not the handler function directly. The demonstration therefore really does
traverse the production path: signature verification, `webhook_events` insert,
amount check, `confirm_booking`, and notification queueing.

It refuses to become a back door in two ways:

1. The constructor throws when `NODE_ENV === 'production'` unless
   `ALLOW_MOCK_PAYMENTS === 'true'`. A deployment that silently confirms
   bookings without taking money will sell parking it cannot pay hosts for.
2. `mock-complete` returns 403 when `provider.name !== 'mock'`, so it cannot be
   used to confirm a booking once a real gateway is configured.

## 3. The Razorpay adapter

Implemented against the REST API directly rather than the SDK, which keeps the
dependency surface small and makes the exact requests visible. There is no
`razorpay` package in `package.json`.

| Operation | Call |
| --- | --- |
| Create order | `POST https://api.razorpay.com/v1/orders` with Basic auth, `{amount, currency, receipt: idempotencyKey.slice(0,40), notes: {booking_id, booking_code}}` |
| Refund | `POST https://api.razorpay.com/v1/payments/{id}/refund` with `{amount, speed: 'normal', notes, receipt}` |
| Webhook verify | HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`, compared against `x-razorpay-signature` in constant time |
| Client callback verify | HMAC-SHA256 of `` `${order_id}|${payment_id}` `` with `RAZORPAY_KEY_SECRET`, compared against `razorpay_signature` |

Razorpay works in paise natively, so no unit conversion happens anywhere in this
file. That absence is a feature: there is no rounding step to get wrong.

Event ids are derived rather than read:

```ts
const entityId = payment?.id ?? refund?.id ?? 'unknown';
const eventId = `${eventType}:${entityId}`;
```

because Razorpay does not put a stable event id in the body for every event type.
Combined with the unique constraint on `(provider, provider_event_id)`, this
still gives exactly-once processing.

Event types map to statuses: `payment.captured` to `captured`,
`payment.authorized` to `authorized`, `payment.failed` to `failed`, anything
starting `refund.` to `refunded`, everything else to `ignored`.

Two known gaps in the adapter as written:

- `createIntent` sets a header `'X-Razorpay-Account': ''`. That is an empty
  header for a feature (Route sub-merchant accounts) that is not being used, and
  should be removed.
- The CSP in `next.config.mjs` has `script-src 'self' 'unsafe-inline'
  'unsafe-eval'` and does not allow `https://checkout.razorpay.com`, which is
  the script the checkout client injects. Under the configured CSP the real
  gateway sheet would not load in production. `connect-src` similarly does not
  allow `https://api.razorpay.com`. Both must be added before switching provider.

## 4. Two verification paths, and why only the webhook may confirm

| Path | What it proves | May confirm a booking |
| --- | --- | --- |
| `verifyClientCallback` | The browser saw a success screen and holds a signature over `order_id\|payment_id` | **No** |
| `verifyWebhook` | The gateway's own server sent us this event and signed the exact bytes | **Yes** |

They are not interchangeable, and the reason is simple: whoever controls the
browser controls what it sends. A client callback can be replayed from a previous
successful payment, or fabricated by anyone who has obtained a valid
`order_id|payment_id` pair. The webhook arrives server to server over a channel
the user cannot interpose on, signed with a secret the user never sees.

The Razorpay adapter documents this in its own header comment, and the checkout
client honours it:

```ts
handler: () => {
  // The browser says it succeeded. That is a hint, not proof: the webhook
  // is what confirms. So we wait for the server rather than celebrating.
  awaitConfirmation();
},
```

`awaitConfirmation()` polls `GET /api/bookings` every 2 seconds for 15 attempts,
30 seconds in total. On timeout it shows: "Your payment went through but we have
not had confirmation yet. Do not pay again. Open My bookings in a moment and it
should be there."

`verifyClientCallback` is implemented on both providers and is **not called
anywhere in this build**. The checkout client does not send the callback fields
to the server at all; it goes straight to polling. The method is part of the
contract and is ready for a flow that needs it, and saying so is more useful than
implying it is in use.

The database enforces the rule structurally: `confirm_booking(uuid, uuid)` is
explicitly revoked from `anon` and `authenticated` in migration 0008. Even a
client that forged a perfect callback could not call the function that confirms.

## 5. Idempotency at three levels

Payments are the one place where doing something twice costs a real person real
money, so it is defended three times over at three different layers.

### Level 1: the client key

`checkout-client.tsx` holds `idempotencyKeyRef = useRef(newKey())`, initialised
once per page load with `crypto.randomUUID()`. Every call to
`POST /api/payments/create` from that page carries the same key, so a
double-clicked Pay button sends two requests with one key.

`bookingRequestSchema` also requires an `idempotency_key` of 8 to 100 characters
on booking creation.

### Level 2: the payments table unique constraint

```sql
idempotency_key text unique
```

The second insert with the same key raises PostgreSQL `23505`. The route treats
that as the retry case working correctly:

```ts
if (insertError && insertError.code !== '23505') {
  console.error('[payments] could not record payment', insertError.message);
}
```

It does not log, does not fail, and still returns the intent. One payment row
exists, not two.

Razorpay reinforces this at the gateway: `receipt` is set to the same key, and
Razorpay treats a repeated receipt as the same order.

Booking creation has its own idempotency check, though it keys differently: it
looks for an existing `pending` or `confirmed` booking by the same driver, for
the same space and the exact same `starts_at`/`ends_at`, created within the last
hour, and returns it with `idempotent: true`. The one-hour window comfortably
covers a user retrying a failed payment while not resurrecting a booking they
made yesterday.

### Level 3: the webhook_events unique constraint

```sql
constraint webhook_events_unique_per_provider unique (provider, provider_event_id)
```

Every gateway retries. Some retry for days. This constraint is what turns
at-least-once delivery into exactly-once processing. The handler inserts the
event row **before** doing any work; a `23505` short-circuits to
`{ok: true, duplicate: true}` with HTTP 200 and no side effects at all.

Behind that, two more idempotency guards protect the side effects if the first
one is ever bypassed: the payment update is conditional on
`payment.status !== 'captured'`, and `confirm_booking` returns
`{ok:true, already:true}` when the booking is already confirmed, which prevents
the wallet debit, the coupon redemption and the referral promotion from
double-applying.

## 6. The money model

Every amount is an integer number of paise in a `bigint` column and a JavaScript
`number`. There are no floats and no decimal rupees anywhere below the
presentation layer.

The reasoning in `src/lib/money.ts` is explicit about why paise rather than a
decimal library: the largest amount this product will ever represent is a monthly
corporate invoice, comfortably under 10^9 paise, and JavaScript integers are
exact to 2^53, about 9 x 10^15. Six orders of magnitude of headroom. A decimal
library would buy nothing and cost a dependency.

`assertPaise()` guards every trust boundary and rejects non-integers with a
message that names the cause:

```
amount must be an integer number of paise, received 12.5. Rupee amounts must be
converted with rupeesToPaise() before entering the money layer.
```

That is the bug it exists to catch: someone passes 12.5 meaning rupees, and
without the guard it silently becomes 12.5 paise.

Rates are expressed in **basis points**, not fractions. `applyBasisPoints(amount,
bp)` returns `Math.round((amount * bp) / 10_000)` and rejects a non-integer bp.
The comment gives the reason: a rate stored as 0.1 in JSON and read back as
0.09999999999999999 is a real thing that happens, and "1000" is unambiguous in a
database column in a way "0.1" is not.

### The formula

```
taxable_amount   = base_amount - discount_amount - wallet_applied
service_fee      = round(taxable_amount   × DRIVER_SERVICE_FEE_BP / 10000)
tax_amount       = round(service_fee      × GST_BP                / 10000)
total_amount     = taxable_amount + service_fee + tax_amount
host_commission  = round((base - discount) × HOST_COMMISSION_BP   / 10000)   ← pre-wallet
host_payout      = (base - discount) - host_commission
platform_revenue = host_commission + service_fee
```

Two properties are asserted by the test suite and enforced by the database:

- `total = taxable + service_fee + tax`, checked by the
  `bookings_total_is_consistent` constraint on every write.
- `base - discount = host_commission + host_payout`, so the host's side never
  loses or invents a paise.

Commission is taken on the **pre-wallet** amount. A wallet credit is the
platform's promotional cost, not the host's, and the host must be paid exactly as
if the driver had paid cash. The test asserts it directly:
`withWallet.hostPayout === withoutWallet.hostPayout`.

### Worked example: a Rs 300 booking

Rates 10 percent commission, 5 percent service fee, 18 percent GST on the fee.

| Line | Paise | Rupees |
| --- | --- | --- |
| Base amount | 30,000 | Rs 300.00 |
| Discount | 0 | Rs 0.00 |
| Taxable amount | 30,000 | Rs 300.00 |
| Service fee, 5 percent | 1,500 | Rs 15.00 |
| GST on the fee, 18 percent | 270 | Rs 2.70 |
| **Driver pays** | **31,770** | **Rs 317.70** |
| Host commission, 10 percent | 3,000 | Rs 30.00 |
| **Host receives** | **27,000** | **Rs 270.00** |
| **Platform revenue** | **4,500** | **Rs 45.00** |

### Worked example: a Rs 500 booking

| Line | Paise | Rupees |
| --- | --- | --- |
| Base amount | 50,000 | Rs 500.00 |
| Service fee, 5 percent | 2,500 | Rs 25.00 |
| GST on the fee, 18 percent | 450 | Rs 4.50 |
| **Driver pays** | **52,950** | **Rs 529.50** |
| Host commission, 10 percent | 5,000 | Rs 50.00 |
| **Host receives** | **45,000** | **Rs 450.00** |
| **Platform revenue** | **7,500** | **Rs 75.00** |

Both examples are asserted in `src/lib/money.test.ts` and
`src/lib/policy.test.ts` respectively, so the documents and the code cannot drift
apart silently.

### Splitting without losing a paise

`splitPaise(total, n)` floors and distributes the remainder one paise at a time
to the earliest recipients. `splitPaiseByWeights(total, weights)` uses the
largest-remainder method: floor every share, then hand the leftover paise to
whichever shares lost the most in the flooring. The same method used for
apportioning parliamentary seats, and correct here for the same reason. Both are
exercised with 200 randomised cases each asserting that the parts sum exactly to
the total.

Neither is called by application code yet. They exist for the payout run, which
is not implemented.

## 7. The refund flow

`compute_refund_paise(booking_id, by)` is pure policy with no side effects, and
is granted to `authenticated` so a driver can preview their refund before
cancelling.

| Situation | Refund to instrument | Wallet return | Host keeps | Platform keeps |
| --- | --- | --- | --- | --- |
| Host or platform cancels | `total - wallet_applied`, fee included | `wallet_applied` | 0 | 0 |
| Already checked in | 0 | 0 | `net − commission` | `commission + service_fee` |
| `flexible`, 1 h or more before | `net_paid` | proportional | 0 | `service_fee` |
| `flexible`, inside 1 h | 0 | 0 | `net − commission` | `commission + service_fee` |
| `moderate`, 24 h or more before | `net_paid` | proportional | 0 | `service_fee` |
| `moderate`, inside 24 h | `net_paid / 2` | proportional | half the forfeit less commission | `commission + service_fee` |
| `strict`, 48 h or more before | `net_paid / 2` | proportional | half less commission | `commission + service_fee` |
| `strict`, inside 48 h | 0 | 0 | `net − commission` | `commission + service_fee` |
| `non_refundable` | 0 | 0 | `net − commission` | `commission + service_fee` |

where `net_paid = base_amount - discount_amount`.

Two decisions that the first draft left ambiguous and migration 0009 settled:

1. **`flexible` after its cutoff refunds nothing.** It is the most generous
   policy before the cutoff and the strictest after it, deliberately. A space
   released an hour before the stay can still be resold. One released ten minutes
   before cannot.
2. **Commission is charged only on what the host actually keeps.** When a driver
   forfeits, the platform takes its commission percentage of the forfeited amount
   and the host keeps the rest, on the same split as a completed stay. The
   platform does not take a full commission on a booking that was never
   delivered, and the host is not paid gross on one either.

The wallet portion returns to the wallet **in proportion to the cash refund**:

```sql
wallet_return := least(b.wallet_applied_paise,
                       round(b.wallet_applied_paise * refund::numeric / net_paid));
refund := greatest(refund - wallet_return, 0);
```

so a driver who paid half in credit gets half their refund back as credit and
half to the card, which keeps the two consistent.

`cancel_booking` then writes:

| Effect | Detail |
| --- | --- |
| `bookings` | `status='cancelled'`, `cancelled_at`, `cancelled_by`, `refund_amount_paise`, `host_payout_paise := host_keeps`, `host_commission_paise := platform_keeps - service_fee` |
| `wallet_transactions` | A `refund_credit` row when `wallet_return > 0` |
| `host_profiles` | `total_earnings_paise` and `payable_balance_paise` credited with the host's forfeit share immediately. They held the bay and turned other drivers away for it |
| `refunds` | One row, `status='requested'`, joined to the most recent `captured` payment, carrying `policy_applied`, `host_retained_paise` and `platform_retained_paise` so a finance report a month later can say exactly what happened without recomputing policy against rates that may since have changed |
| `coupon_redemptions` | Deleted, and `coupons.redemption_count` decremented, so the driver can use the code again |
| `booking_events` | A `cancelled` row carrying the full split |

**The critical limitation:** the `refunds` row is created with
`status = 'requested'` and **nothing ever processes it**. Neither
`MockPaymentProvider.refund()` nor `RazorpayProvider.refund()` is called from any
route, any cron step or any admin action. Both are implemented and correct; both
are unreachable. Money that should go back to a card does not, in this build. The
schema is ready (`refunds.provider_refund_id`, `approved_by`, `completed_at`,
`failure_reason` all exist) and the work is a drain loop over
`refunds where status = 'requested'`.

The wallet half **does** execute immediately, because it is a database write
rather than a gateway call.

## 8. The payout model

The intended model, as expressed in the schema:

| Element | State |
| --- | --- |
| `host_profiles.payable_balance_paise` | Incremented on completion and on a host's forfeit share. **Never decremented** |
| `host_profiles.total_earnings_paise` | Lifetime total, incremented alongside |
| `host_profiles.payout_ref`, `payout_ref_provider` | An opaque provider reference. Raw bank details never enter this database |
| `PAYOUT_DELAY_HOURS`, default 24 | The clearing delay after checkout before earnings become payable |
| `payouts` | Schema, RLS and indexes complete. `host_id`, `amount_paise`, `period_start`, `period_end`, `booking_count`, `status`, `provider_payout_id`, `utr_reference`, `scheduled_for`, `paid_at` |
| `payout_items` | Line items linking a payout to the exact bookings it settles, primary key `(payout_id, booking_id)` |

**What actually runs today:** cron step 6 reads `PAYOUT_DELAY_HOURS`, counts
`bookings where status='completed' and checked_out_at < cutoff`, and returns that
number in the response as `payable_bookings`. It creates no payout, moves no
money and decrements no balance.

A host in this build accrues a `payable_balance_paise` that the system will never
pay out. That is the single largest functional gap on the money side, and it
cannot be closed by code alone: it depends on the commercial questions in section
10.

## 9. What the payments layer stores, and what it never stores

| Stored | Never stored |
| --- | --- |
| `provider`, `provider_order_id`, `provider_payment_id`, `method` | Card numbers, CVV, expiry |
| `amount_paise`, `currency`, `status` | Bank account numbers or IFSC codes |
| `idempotency_key` | UPI PINs |
| `failure_code`, `failure_reason` | Anything that would make this system in scope for PCI DSS beyond SAQ-A |
| `raw_payload` (the provider's own JSON, for reconciliation and dispute evidence) | |

The checkout page tells the user: "Payment details never touch ParkSpace servers.
They go straight to the payment provider." That is accurate for both providers:
the gateway sheet is hosted by the gateway, and what comes back is a token and an
order id.

`raw_payload` is retained deliberately. When a driver disputes a charge four
months later, the gateway's own record of what it sent is the evidence, and
reconstructing it from our derived columns is not the same thing.

## 10. REVIEW REQUIRED: unresolved commercial questions

**Every item in this section must be settled with a chartered accountant and a
payments lawyer before this platform handles a single rupee of real money.** The
code makes each of these a configuration value or an isolated function so the
answer can be applied without touching the booking engine, but the answers are
not in this repository and no line of code should be read as advice.

### 10.1 Settlement account structure

| Question | Why it matters |
| --- | --- |
| Does the platform collect into its own current account and pay hosts out of it, or does it use a gateway's split-settlement product (Razorpay Route or equivalent) so funds never rest with us? | Determines whether the platform is holding public money, which changes the regulatory question entirely |
| If split settlement, is each host onboarded as a sub-merchant, and who owns that KYC? | Sub-merchant onboarding has its own KYC burden and its own liability for onboarding a bad actor |
| What is the settlement cycle, T+2 or T+3, and does `PAYOUT_DELAY_HOURS` need to accommodate it? | Paying a host before the gateway has settled to us means funding payouts from working capital |

### 10.2 Whether the platform may hold funds at all

| Question | Why it matters |
| --- | --- |
| Does holding a driver's money between payment and the host's payout constitute operating a payment system requiring RBI authorisation under the Payment and Settlement Systems Act 2007? | This is the question that decides whether the current design is legal as built |
| Does the RBI's guidance on payment aggregators apply, and if so is the platform a PA requiring a licence, or does the "e-commerce marketplace escrow" carve-out apply? | A marketplace that never touches funds has a very different obligation from one that does |
| If an escrow or nodal account is required, which bank, and what are the operating conditions? | Nodal account rules constrain what may be debited, when, and for what |
| What happens to unclaimed host balances? | Unclaimed money has its own treatment and cannot simply sit on the balance sheet |

### 10.3 GST treatment

`GST_PCT` defaults to 0.18 and is applied to the service fee only. That is a
**placeholder**, and the seeded `platform_settings` row says so in its own
description field: "Placeholder tax rate on platform fees. REVIEW REQUIRED with a
chartered accountant."

| Question | Why it matters |
| --- | --- |
| Is renting a parking space a supply of service liable to GST, and at what rate? | If the parking itself is taxable, the current model, which taxes only the fee, is wrong |
| Is the platform an "electronic commerce operator" under section 9(5), making it liable to pay GST on the host's supply rather than the host? | This would change who remits, who invoices, and what the driver's receipt must show |
| What is the position for an unregistered host below the threshold? | Most individual hosts renting one driveway will be below the registration threshold |
| Who issues the tax invoice to the driver, and what must it contain? | An invoice that is wrong is a compliance failure on every booking, not one |
| Is the place of supply the location of the parking space? | Determines CGST + SGST versus IGST |
| Is GST due on the forfeited amount when a driver cancels late? | The forfeit is retained consideration, and its treatment is not obvious |

### 10.4 TDS and TCS

| Question | Why it matters |
| --- | --- |
| Does section 194-O apply, requiring 1 percent TDS on the gross amount paid to each host? | If yes, every payout needs a deduction, a challan and a quarterly return |
| Is there a threshold below which an individual host is exempt, and how is it tracked across a financial year? | Tracking cumulative payouts per host per year is a schema requirement that does not exist today |
| Is TCS under section 52 of the CGST Act applicable at 1 percent on the net value of taxable supplies? | Another deduction, another return, another reconciliation |
| Who files Form 26Q / the GSTR-8 return, and against whose PAN? | |
| What happens when a host has no PAN? | Higher deduction rates apply, which changes the payout arithmetic |

### 10.5 Refunds, chargebacks and disputes

| Question | Why it matters |
| --- | --- |
| When a driver charges back after the host has been paid, who bears the loss? | The current schema has no mechanism to claw back from a host |
| What is the maximum refund window, and does it exceed the gateway's own? | A refund past the gateway window has to be paid some other way |
| Are cancellation forfeits enforceable as liquidated damages under Indian contract law, or could they be read as a penalty and struck down? | The entire cancellation policy depends on the answer |
| Is the service fee refundable as a matter of consumer law even when the policy says it is retained? | Consumer Protection Act 2019 and the e-commerce rules may override the stated policy |

### 10.6 Host onboarding and liability

| Question | Why it matters |
| --- | --- |
| What KYC is required before paying a host, and is Aadhaar-based verification permissible for a private platform? | `verification_documents` stores only a path, which is the right shape, but the permissible scope is a legal question |
| Does paying a host constitute a business relationship requiring PMLA record keeping? | Record retention periods would follow |
| Is the host's income reportable by the platform? | |

### 10.7 What the code already does correctly, pending those answers

| Isolation | Where |
| --- | --- |
| Every rate is a runtime setting, not a constant | `platform_settings`, read through `setting_numeric` |
| Rates are frozen onto each booking | `commission_rate_bp`, `service_fee_rate_bp`, `tax_rate_bp` on `bookings` |
| Tax is computed in one expression in one function | `quote_booking`, mirrored in `computeBreakdown` |
| The refund split is recorded, not recomputed | `refunds.host_retained_paise`, `platform_retained_paise`, `policy_applied` |
| Payouts are a separate table with line items | `payouts` + `payout_items`, ready for whatever the settlement answer turns out to be |

Changing the tax model means changing one expression and one migration. That is
the point of the isolation, and it is the reason these questions can be left open
in a specification without leaving them open in the code.
