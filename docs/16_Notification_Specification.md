# 16. Notification Specification

> Read section 4 before anything else. The short version: this build queues
> notification rows and marks them sent. It does not deliver them.

## 1. The notifications table as a queue

There is no message broker, no Redis list and no third-party queue service. The
queue is a Postgres table, and that is a deliberate choice: a notification that
needs to survive a deploy, be inspected by an operator, be deduplicated by a
unique constraint and be joined to the booking that caused it is better served by
a table than by an ephemeral queue.

```sql
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  channel       notification_channel not null default 'in_app',
  template_key  text not null,
  title         text not null,
  body          text not null,
  action_url    text,
  data          jsonb not null default '{}'::jsonb,

  send_after    timestamptz,   -- null means "as soon as possible"
  sent_at       timestamptz,   -- null means "still queued"
  read_at       timestamptz,
  failed_reason text,

  dedupe_key    text,
  created_at    timestamptz not null default now()
);
```

| Column | Role in the queue |
| --- | --- |
| `send_after` | The earliest instant a row may be delivered. `null` means immediately |
| `sent_at` | The claim marker. `null` means unclaimed and eligible |
| `read_at` | In-app read receipt, written by the user |
| `failed_reason` | Reserved for a delivery failure message. **Nothing writes to it today** |
| `dedupe_key` | Section 2 |
| `channel` | One of `in_app`, `push`, `email`, `sms`, `whatsapp` |
| `data` | Structured payload, currently `{ booking_id }` or `{ space_id, decision }` |
| `action_url` | A relative path such as `/bookings/<id>` |

Three indexes support it:

| Index | Query |
| --- | --- |
| `notifications_pending_idx on (send_after) where sent_at is null` | The drain query |
| `notifications_user_idx on (user_id, created_at desc)` | The inbox |
| `notifications_unread_idx on (user_id) where read_at is null` | The unread badge |

RLS: `notifications_own` allows a user to read their own rows (and admins to read
all). `notifications_own_update` allows a user to update their own rows, which is
how `read_at` gets written. There is no insert policy for clients at all, so
notifications can only originate from the service role.

## 2. The dedupe_key mechanism

```sql
create unique index notifications_dedupe_idx on notifications(dedupe_key)
  where dedupe_key is not null;
```

A **partial** unique index. Rows with a null `dedupe_key` are not constrained at
all, so ad-hoc notifications can be inserted freely, while rows that carry a key
are unique across the entire table.

The key encodes the **event plus the entity**, never a timestamp:
`confirmed:driver:<booking_id>`, `remind24:<booking_id>`. Because the key does
not vary with when the insert happened, a second attempt to queue the same
notification for the same booking collides and fails rather than producing a
duplicate.

This is what protects against the realistic failure modes:

| Failure | What the index does |
| --- | --- |
| The webhook is delivered twice and both get past the `webhook_events` guard | The second `insert` into `notifications` collides on all five keys |
| The scheduler is run twice in the same window | Same |
| A retried deploy re-runs a backfill | Same |
| Two instances process concurrently | One wins, the other gets `23505` |

The trade-off is that a legitimate resend needs a different key or a null key.
Deliberately re-notifying about the same booking, for example after a host
changes the access instructions, must use a new key such as
`access_changed:<booking_id>:<revision>`.

One caveat worth stating plainly: `queueBookingNotifications` inserts all five
rows in a **single** `insert` call. PostgREST sends that as one statement, so a
collision on any one row fails the whole batch. In practice that is fine, because
the only way to reach a collision is for all five to be duplicates, but a future
version that mixes new and already-queued notifications in one batch would lose
the new ones. `upsert` with `onConflict: 'dedupe_key'` and `ignoreDuplicates`
would be the safer shape.

## 3. The templates that actually exist

### 3.1 Queued by the payment webhook

`queueBookingNotifications()` in `src/app/api/payments/webhook/route.ts` runs
once per newly confirmed booking, and only when `confirm_booking` returned
`already: false`, so a replayed webhook does not re-queue.

| # | `template_key` | Channel | Recipient | `dedupe_key` | `send_after` | Title and body |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `booking_confirmed_driver` | `in_app` | driver | `confirmed:driver:<booking_id>` | none, immediate | "Your parking is booked" / "Booking `PS-XXXXXX` is confirmed. Your access details will appear here 24 hours before you arrive." |
| 2 | `booking_confirmed_host` | `in_app` | host | `confirmed:host:<booking_id>` | none, immediate | "You have a new booking" / "Booking `PS-XXXXXX` starts `<start, en-IN locale string>`." |
| 3 | `booking_reminder_day` | `push` | driver | `remind24:<booking_id>` | `starts_at − 24 h` | "Parking tomorrow" / "Your booking `PS-XXXXXX` starts tomorrow. Access details are now available." |
| 4 | `booking_reminder_soon` | `push` | driver | `remind30m:<booking_id>` | `starts_at − 30 min` | "Your parking space is ready" / "Booking `PS-XXXXXX` starts in 30 minutes." |
| 5 | `booking_ending_soon` | `push` | driver | `endingsoon:<booking_id>` | `ends_at − 15 min` | "Your booking ends soon" / "Booking `PS-XXXXXX` ends in 15 minutes. Extend it if you need longer." |

All five carry `action_url: /bookings/<id>` except number 2, which points at
`/host/bookings`, and all five carry `data: { booking_id }`.

The timing of number 3 is not arbitrary. `has_address_access()` releases the
exact address, the access instructions and the access PIN from 24 hours before
the stay, so the T-24h reminder is the first moment the driver can actually use
the information the notification points them at. "Access details are now
available" is literally true at that instant.

### 3.2 Queued by admin actions

`notifyUser()` in `src/lib/admin.ts` writes a single `in_app` row with
**`sent_at` already set to now** and no `dedupe_key`, so it bypasses the queue
entirely and appears immediately in the recipient's in-app list.

| `template_key` | Recipient | Trigger | `action_url` |
| --- | --- | --- | --- |
| `listing_approved` | host | `POST /api/admin/spaces/[id]/moderate` with `approve` | `/host/spaces` |
| `listing_rejected` | host | Same route with `reject`. The body is the moderator's reason, which is required to be at least 10 characters | `/host/spaces` |
| `account_suspended` | the user | `POST /api/admin/users/[id]/suspend` with `suspend` | `/help` |
| `account_reinstated` | the user | Same route with `unsuspend` | `/help` |

`notifyUser` never throws. An audit or notification write that fails must not
roll back the action it was describing, because an unrecorded change is bad and a
change that silently did not happen is worse. Failures are logged for the
operator instead.

### 3.3 Templates that do not exist

For completeness, because a reader will look for them: there is no cancellation
notification, no refund notification, no check-in or check-out notification, no
review request, no message notification, no dispute notification, no payout
notification and no marketing notification. `cancel_booking`, `check_in_booking`
and `check_out_booking` write `booking_events` rows but queue nothing.

## 4. THIS BUILD DOES NOT DELIVER NOTIFICATIONS

> **Nothing in this repository sends an email, an SMS, a push notification or a
> WhatsApp message. No provider is configured, no provider SDK is installed, no
> API key exists for any messaging service, and no HTTP call to any messaging
> endpoint is made anywhere in the codebase.**

The entirety of the "dispatch" step is this, from step 5 of `GET /api/cron`:

```ts
const { data, error } = await service
  .from('notifications')
  .update({ sent_at: new Date().toISOString() })
  .is('sent_at', null)
  .lte('send_after', new Date().toISOString())
  .select('id');

outcome.notifications_dispatched = error ? `error: ${error.message}` : (data?.length ?? 0);
```

It sets a timestamp. That is all. The route's own comment is explicit:

```
// In this build that is all it does: there is no email or SMS provider wired
// up, and pretending otherwise would be worse than being explicit. The rows
// are the queue, and a real worker replaces this step.
```

The practical consequences, stated without softening:

| Row | What the user actually experiences |
| --- | --- |
| `channel: 'in_app'` | It works. The row is readable through RLS and renders in the app. The only thing "sending" adds is the timestamp |
| `channel: 'push'` | Nothing. All three reminder rows are `push`, so **no reminder reaches any driver**. The T-24h, T-30min and ending-soon reminders are marked sent and vanish |
| `channel: 'email'`, `'sms'`, `'whatsapp'` | Nothing is ever queued on these channels in this build, and nothing would happen if it were |

The reporting is also misleading in one respect worth naming: the cron response
field is called `notifications_dispatched` and returns a count. Nothing was
dispatched. It is a count of rows marked.

`failed_reason` exists on the table and is never written, because nothing can
fail when nothing is attempted.

### The one thing this design does get right

Notifications are written as **rows** rather than sent inline at the point the
event happens. The webhook comment gives the reason:

```
// Written as rows rather than sent inline, because a failing email provider must
// never roll back a confirmed booking. A worker drains the table.
```

That is the correct architecture. A booking must not fail because an SMTP server
was slow. The queue is real, durable, deduplicated and indexed. The only missing
piece is the worker, and swapping the cron's `update` for a genuine drain loop is
a contained change that touches one function.

## 5. Scheduled reminders and the past-dated rule

`queueBookingNotifications` filters before inserting:

```ts
const now = Date.now();
const keep = rows.filter(
  (row) => !row.send_after || new Date(row.send_after as string).getTime() > now,
);
await service.from('notifications').insert(keep);
```

**A reminder whose `send_after` is already in the past is dropped, not fired
late.**

The comment states the case it exists for: "what stops a last-minute booking from
sending 'parking tomorrow' instantly." A driver who books a space starting in 20
minutes would otherwise receive, all at once, the moment they paid:

- "Parking tomorrow. Your booking starts tomorrow." (scheduled for 24 hours ago)
- "Your parking space is ready. Booking starts in 30 minutes." (scheduled for 10
  minutes ago)

Both are wrong, one of them absurdly so. Firing a stale reminder is worse than
firing none, because it actively misinforms and it teaches the user that our
notifications are not to be trusted.

The rule generalises: **a time-bound notification is only worth sending inside
the window it describes.** The two rows that carry no `send_after`, the
confirmation pair, are never dropped, because "your booking is confirmed" is true
whenever it arrives.

Note the filter runs at **queue time**, in application code, not at drain time.
A row already in the table whose `send_after` has passed will still be picked up
by the drain query, which selects `lte('send_after', now)` with no lower bound. A
real worker needs its own staleness check, because a worker that has been down
for six hours must not flush six hours of stale reminders on restart. See section
7.

The scheduler granularity is the cron schedule: `*/5 * * * *` from `vercel.json`.
A reminder scheduled for T-30min therefore fires somewhere between T-30min and
T-25min. That is fine for every template listed above, and it is worth knowing
before adding one that needs tighter timing.

## 6. What a real worker would have to do

Replacing step 5 of the cron with a genuine delivery worker. The order matters.

```
1.  CLAIM        Atomically claim a batch so two instances cannot send the same row.
                 UPDATE notifications SET sent_at = now()
                  WHERE id IN (SELECT id FROM notifications
                               WHERE sent_at IS NULL
                                 AND (send_after IS NULL OR send_after <= now())
                                 AND (send_after IS NULL OR send_after > now() - interval '2 hours')
                               ORDER BY send_after NULLS FIRST
                               LIMIT 100
                               FOR UPDATE SKIP LOCKED)
                 RETURNING *;
                 FOR UPDATE SKIP LOCKED is what makes this safe under concurrency.
                 The two-hour lower bound is the staleness rule from section 5.

2.  RESPECT      Read profiles.notification_prefs for each recipient and drop any
                 row whose channel the user has opted out of. Marketing is already
                 false by default. Never send to a suspended account.

3.  RENDER       Map template_key to a channel-specific template. The title and
                 body on the row are in-app copy; an email needs a subject, a
                 plain-text part and an HTML part, and an SMS needs a 160-character
                 version with a sender ID.

4.  SEND         Call the provider. Bound every call with a timeout.

5.  RECORD       On success, leave sent_at as claimed and store the provider's
                 message id in data. On failure, set failed_reason and either
                 clear sent_at for a retry or leave it set and give up, depending
                 on whether the error is retryable.

6.  RETRY        Exponential backoff with a cap: 1 min, 5 min, 25 min, then stop.
                 A retry count needs to live on the row; the schema does not have
                 one today and would need attempts integer not null default 0.

7.  OBSERVE      Emit a metric per channel per outcome. A silent notification
                 system that has stopped working looks exactly like one with
                 nothing to send.
```

Two schema additions the worker would need, neither of which exists today:

| Column | Purpose |
| --- | --- |
| `attempts integer not null default 0` | Backoff and give-up |
| `provider_message_id text` | Reconciling a bounce or a delivery receipt back to the row |

And one behavioural change: `sent_at` currently means "we marked it". For a real
worker it should mean "the provider accepted it", with a separate
`delivered_at` for a provider-confirmed delivery receipt where the channel
supports one.

## 7. Recommended providers, by channel

All of these have a free tier sufficient for a Kolkata-first launch. The point of
naming them is that "add an email provider" is not an unbounded decision.

| Channel | Recommended | Free tier | Why |
| --- | --- | --- | --- |
| Email, transactional | **Resend** | 3,000 emails per month, 100 per day | Simple REST API, no SDK required, good deliverability, DKIM and SPF setup is documented. Fits the existing pattern of calling REST directly rather than adding an SDK |
| Email, alternative | **Brevo** (formerly Sendinblue) | 300 emails per day, no monthly cap | Higher daily ceiling if the volume shape is bursty. Also offers SMS in India |
| SMS, India | **MSG91** | Trial credits, then roughly Rs 0.15 to Rs 0.20 per SMS | India-specific. Handles DLT registration, which is **mandatory** for transactional SMS in India under TRAI rules. A provider that does not handle DLT is unusable here regardless of price |
| SMS, alternative | **Twilio** | Trial credit | Better API, but DLT registration for Indian numbers is still required and is more painful to arrange through a non-Indian provider |
| Push, web | **Web Push via VAPID** | Free, no provider at all | Standard `web-push` protocol straight to the browser's push service. No third party, no key to buy, works on Android Chrome and on iOS Safari 16.4+ for installed PWAs. This is the right first push channel for this product |
| Push, native | **Firebase Cloud Messaging** | Free, unlimited | Only relevant once native apps exist, which is out of MVP scope |
| WhatsApp | **Meta WhatsApp Business Cloud API** | 1,000 service conversations per month | The only legitimate route. Every template must be pre-approved by Meta, and a message outside a 24-hour customer-service window must use an approved template. Budget weeks, not days, for approval |
| In-app | Already works | Free | The `notifications` table plus RLS |

### Recommended rollout order

1. **Web push**, because it costs nothing, needs no third party, and covers the
   three reminder templates that are the ones actually broken today.
2. **Email**, because it is the fallback when push is not granted and is the only
   channel suitable for a receipt.
3. **SMS**, only for the T-30min reminder and only after DLT registration,
   because it costs real money per message and is the channel users resent most
   when it is used for anything non-urgent.
4. **WhatsApp**, last, and only if the market data justifies the template
   approval overhead.

### A regulatory note that is not optional

Transactional SMS in India requires DLT (Distributed Ledger Technology)
registration of the sender entity, the header and every template, under TRAI's
Telecom Commercial Communications Customer Preference Regulations. An unregistered
template is not delivered, silently. This is not a provider choice, it is a legal
precondition, and it is the single most common reason an Indian product's SMS
"does not work".

## 8. Delivery guarantees required

| Property | Requirement | How it is achieved |
| --- | --- | --- |
| **At-least-once, never at-least-twice-visibly** | A user must never receive the same notification twice | The `dedupe_key` partial unique index prevents duplicate rows. `FOR UPDATE SKIP LOCKED` plus the `sent_at` claim prevents duplicate sends of one row |
| **Ordering** | Not required. Notifications are independent | No ordering guarantee is needed, which is why a simple claim-and-send loop is sufficient |
| **Timeliness** | A reminder is worthless outside its window | The staleness bound in the claim query, plus the queue-time drop rule from section 5 |
| **Durability** | A queued notification must survive a deploy, a cold start and a provider outage | It is a Postgres row, not an in-memory job |
| **Isolation from the transaction** | A failing provider must never roll back a booking | Rows are written by the webhook after `confirm_booking` returns, and the send happens in a separate process entirely |
| **Preference respect** | A user who has opted out must not be sent to | `profiles.notification_prefs` exists with sensible defaults. **Nothing reads it today.** The worker must |
| **Suppression** | A hard bounce or an unsubscribe must suppress future sends on that channel | Not modelled. A `notification_suppressions (user_id, channel, reason, created_at)` table would be needed |
| **Observability** | A silent failure must be visible | Per-channel counters and an alert on "zero sent in an hour when the queue is non-empty" |

## 9. Summary of the gap

| Element | Built | Working |
| --- | --- | --- |
| Queue table with the right columns | Yes | Yes |
| Dedupe by unique partial index | Yes | Yes |
| Scheduled sends via `send_after` | Yes | Yes |
| Past-dated reminders dropped at queue time | Yes | Yes |
| Nine templates defined across two call sites | Yes | Rows are created |
| RLS so a user reads only their own | Yes | Yes |
| In-app delivery | Yes | Yes |
| Drain loop that claims safely | No | The current update has no `FOR UPDATE SKIP LOCKED`, no batch limit and no staleness bound |
| Any email, SMS, push or WhatsApp delivery | **No** | **No** |
| Preference checking | No | `notification_prefs` is stored and never read |
| Retry, backoff, suppression, observability | No | No |
