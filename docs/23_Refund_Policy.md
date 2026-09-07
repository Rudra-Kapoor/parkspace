# 23. Refund and Cancellation Policy (Draft)

> **UNREVIEWED DRAFT. NOT LEGAL ADVICE. DO NOT PUBLISH TO REAL USERS.**
>
> This is an engineering-ready draft prepared for review by qualified Indian counsel. It
> has **not** been settled by an advocate and it has **not** been settled by a chartered
> accountant. It is not an executable legal instrument and it must **not** be presented to
> a real user in its current form. Sections marked **REVIEW REQUIRED** are known open
> questions, in particular the tax treatment of retained and forfeited amounts, which is
> unresolved. Related open items sit in `20_Legal_Requirements.md` section 14.

Derived from `00_SPEC_KERNEL.md` sections 7 and 8. Where this document and the spec kernel
differ, the spec kernel wins.

---

## 1. The money model, so the examples make sense

Every example in this document uses a **Rs 500 booking**, meaning the Host set a price of
Rs 500 for the period booked. Applying the model in `00_SPEC_KERNEL.md` section 7 with the
default settings:

| Line | Formula | Amount |
| --- | --- | --- |
| Base amount (Host's price) | `base_amount` | Rs 500.00 |
| Discount | none in these examples | Rs 0.00 |
| Taxable amount | `base_amount - discount` | Rs 500.00 |
| Driver service fee, 5 percent | `taxable_amount * 0.05` | Rs 25.00 |
| Tax on the service fee, 18 percent | `service_fee * 0.18` | Rs 4.50 |
| **Total the Driver pays** | `taxable + fee + tax` | **Rs 529.50** |
| Host commission, 10 percent | `taxable_amount * 0.10` | Rs 50.00 |
| **Host payout on a completed booking** | `taxable - commission` | **Rs 450.00** |
| **Platform revenue on a completed booking** | `fee + commission` | **Rs 75.00** |

The Rs 4.50 of tax is collected and remitted. It is not Platform revenue, and it is shown
separately in every example below.

**REVIEW REQUIRED:** whether tax applies only to the service fee, as the spec kernel's
placeholder implementation assumes, or also to the parking supply itself, and what happens
to tax already collected when a booking is cancelled or partially refunded. This is
question 9 in `20_Legal_Requirements.md` section 14 and it is unanswered. Every "tax"
figure in this document is therefore provisional.

Two rules that apply everywhere:

**R1.** When the **Driver** cancels, the service fee is retained by the Platform.
**R2.** When the **Host** or the **Platform** cancels, the service fee is refunded in full.

Both come directly from `00_SPEC_KERNEL.md` section 8.

---

## 2. The four cancellation policies

The Host selects one policy per Space. It is shown on the listing page and again in the
checkout summary before the Driver commits.

| Policy | Rule |
| --- | --- |
| `flexible` | Full refund of the base amount up to 1 hour before the start. |
| `moderate` | Full refund up to 24 hours before the start, half after that. |
| `strict` | Half up to 48 hours before the start, nothing after. |
| `non_refundable` | Nothing once confirmed. Monthly and event inventory only. |

Two implementation rules that the spec kernel does not state explicitly and that are
flagged here rather than assumed silently:

1. For `flexible`, the kernel states only the inside-window rule. The engine treats the
   refundable proportion as **zero** once the 1 hour window has closed, by symmetry with
   the explicit "nothing after" in `strict`. **REVIEW REQUIRED:** confirm this is the
   intended commercial rule before publication, because a Driver reading "flexible" may
   reasonably expect something after the window closes.
2. Where a Driver cancels and the Host retains part of the base amount, the Platform takes
   its 10 percent commission **on the retained amount only**, not on the full booking
   value. **REVIEW REQUIRED:** whether commission should be charged on a forfeited amount
   at all, commercially and for tax.

---

## 3. Worked example: `flexible`

### 3.1 Driver cancels 3 hours before the start, inside the window

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 500.00** | Full refund of the base amount |
| Driver does not get back | Rs 29.50 | Service fee Rs 25.00 plus tax on it Rs 4.50, per rule R1 |
| Host keeps | **Rs 0.00** | No part of the base amount is retained |
| Platform keeps | **Rs 25.00** | The service fee. No commission, because there is nothing to commission |
| Tax collected and remitted | Rs 4.50 | Provisional, see section 1 |

Driver paid Rs 529.50, receives Rs 500.00, is out of pocket Rs 29.50.

### 3.2 Driver cancels 30 minutes before the start, outside the window

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 0.00** | Window closed |
| Host keeps | **Rs 450.00** | Rs 500 retained less Rs 50 commission |
| Platform keeps | **Rs 75.00** | Rs 25 service fee plus Rs 50 commission |
| Tax collected and remitted | Rs 4.50 | Provisional |

---

## 4. Worked example: `moderate`

### 4.1 Driver cancels 30 hours before the start, more than 24 hours out

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 500.00** | Full refund of the base amount |
| Host keeps | **Rs 0.00** | |
| Platform keeps | **Rs 25.00** | Service fee only |
| Tax collected and remitted | Rs 4.50 | Provisional |

Driver out of pocket Rs 29.50.

### 4.2 Driver cancels 5 hours before the start, inside 24 hours

Half of the base amount is refunded.

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 250.00** | Half of Rs 500 |
| Host keeps | **Rs 225.00** | Rs 250 retained less Rs 25 commission, at 10 percent of the retained amount |
| Platform keeps | **Rs 50.00** | Rs 25 service fee plus Rs 25 commission |
| Tax collected and remitted | Rs 4.50 | Provisional |

Driver paid Rs 529.50, receives Rs 250.00, is out of pocket Rs 279.50.

---

## 5. Worked example: `strict`

### 5.1 Driver cancels 72 hours before the start, more than 48 hours out

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 250.00** | Half of Rs 500 |
| Host keeps | **Rs 225.00** | Rs 250 retained less Rs 25 commission |
| Platform keeps | **Rs 50.00** | Rs 25 service fee plus Rs 25 commission |
| Tax collected and remitted | Rs 4.50 | Provisional |

### 5.2 Driver cancels 12 hours before the start, inside 48 hours

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 0.00** | Nothing after the 48 hour mark |
| Host keeps | **Rs 450.00** | Rs 500 less Rs 50 commission |
| Platform keeps | **Rs 75.00** | Rs 25 service fee plus Rs 50 commission |
| Tax collected and remitted | Rs 4.50 | Provisional |

Driver paid Rs 529.50 and receives nothing back. This is why the policy label must be
visible on the listing page, on the checkout summary and on the confirmation, not buried.

---

## 6. Worked example: `non_refundable`

Available only for monthly and event inventory. Nothing is refunded once the booking is
confirmed, whether the Driver cancels the next minute or the day before.

| Party | Amount | Explanation |
| --- | --- | --- |
| Driver receives back | **Rs 0.00** | |
| Host keeps | **Rs 450.00** | Rs 500 less Rs 50 commission |
| Platform keeps | **Rs 75.00** | Rs 25 service fee plus Rs 50 commission |
| Tax collected and remitted | Rs 4.50 | Provisional |

Because the outcome is harsh, `non_refundable` must carry an explicit confirmation step at
checkout: the Driver ticks a box acknowledging that no refund is available. **REVIEW
REQUIRED:** whether a non-refundable term is enforceable against a consumer in India, and
whether the acknowledgement step is sufficient. This is the most likely of the four
policies to be challenged.

---

## 7. Cancellation by the Host

7.1 If the Host cancels a confirmed booking, the Driver receives a **full refund of
everything paid**: Rs 500.00 base, Rs 25.00 service fee and Rs 4.50 tax, a total of
**Rs 529.50**. The Host's chosen policy is irrelevant. This is rule R2.

| Party | Amount |
| --- | --- |
| Driver receives back | **Rs 529.50** |
| Host keeps | **Rs 0.00** |
| Platform keeps | **Rs 0.00** |

7.2 A Host cancellation also triggers the reliability penalty in `21_Host_Terms.md` clause
9.4: a reliability score reduction, search ranking suppression, automatic blocking of the
cancelled dates so that the Space cannot be relet at a higher price, and a cancellation fee
where configured.

7.3 Where the Host cancels close to the start time and the Driver is left without parking,
the Platform will attempt to rebook the Driver into a comparable Space nearby. Where a
comparable Space costs more, the Platform may cover the difference up to a cap set in
`platform_settings`. **REVIEW REQUIRED:** this is a discretionary goodwill measure and must
not be described to users as a guarantee unless the company commits to funding it. Do not
publish a rebooking promise the operations team cannot keep at 2 am.

---

## 8. Cancellation by the Platform

8.1 The Platform may cancel a booking where the listing is found to be fraudulent, where
the Host lacks authority to let the Space, where the Space is unsafe or unlawful, where a
payment is reversed, or where a technical fault has produced an invalid booking.

8.2 The Driver receives a **full refund of Rs 529.50**. The Host receives nothing and, if
the cancellation is due to the Host's breach, may also face suspension.

8.3 Where the Platform cancels for the Driver's breach, for example a falsified check-in or
a fraudulent payment instrument, the cancellation is treated as a **Driver cancellation
under the applicable policy** and the tables in sections 3 to 6 apply.

---

## 9. Situations at the Space

### 9.1 Non-arrival by the Driver (no-show)

The booking passes its start time with no check-in and is marked `no_show`. The Driver is
treated as having cancelled at the start time, so the applicable policy determines the
outcome, which in practice means: `flexible` gives nothing (the 1 hour window has closed),
`moderate` gives half, `strict` gives nothing, `non_refundable` gives nothing.

For a Rs 500 booking on a `moderate` Space: Driver receives Rs 250.00, Host keeps
Rs 225.00, Platform keeps Rs 50.00.

The Host must make the Space available for the whole booked period regardless of a
no-show, because a Driver may arrive late. The Host must not relet the bay.

### 9.2 Space unavailable on arrival

The Driver arrives within the booked period and the Space is occupied, blocked, locked,
missing, or otherwise not usable.

1. The Driver reports it in the Platform from the location, with a photograph where it is
   safe to take one, before leaving.
2. The Platform notifies the Host and gives a short window, default 15 minutes, to resolve
   it.
3. If it is not resolved, the booking is cancelled as a **Host failure**: the Driver
   receives a **full refund of Rs 529.50**, the Host receives nothing, and the reliability
   penalty applies.
4. The Platform will attempt to rebook the Driver nearby, subject to the caveat in 7.3.
5. Repeated unavailability on one Space results in delisting.

### 9.3 Access failure

The Driver arrives and cannot get in: the gate code is wrong, the gate is broken, the
access instructions are wrong, a security guard refuses entry, or a society objects.

Treated the same as 9.2. The full refund of Rs 529.50 applies, because the Host's core
obligation is to make the Space actually usable, not merely to exist.

Where the access failure is caused by the **Driver**, for example an unreadable
registration number entered on the booking, or a vehicle that does not fit the stated
dimensions, it is treated under 9.1 as a no-show.

Where a location reading fails at check-in because the Space is underground, that alone is
not an access failure and does not entitle anyone to anything. See `22_Driver_Terms.md`
clause 6.3.

### 9.4 Overstay

Not a refund situation, but it belongs here because it is the mirror case. A grace period
of 10 minutes (`GRACE_PERIOD_MINUTES` default 10) applies after the end time. Beyond that
an overstay charge accrues from the original end time at the Space's rate with the overstay
multiplier. The overstay amount is settled through the Platform, is subject to the same
commission split as the base booking, and is never charged separately by the Host. See
`22_Driver_Terms.md` clause 5.

---

## 10. The dispute-triggered refund path

Where the parties disagree about what happened, the refund is decided through the dispute
process rather than automatically.

1. **Raise.** Either party opens a dispute from the booking, within 72 hours of the booking
   ending. Later than that, only in exceptional circumstances.
2. **Evidence.** Both parties upload evidence: photographs, the access instructions as they
   appeared, messages. Evidence is write-once and time-stamped. The Platform adds the
   objective record: booking times, check-in and check-out events, the geodistance result,
   the message thread and the audit log.
3. **Response window.** The other party has 48 hours to respond. No response is not a win
   for the silent party, but it removes their ability to contest the facts.
4. **Decision.** A `support` or `admin` user reviews and decides within 5 business days,
   recording the reason. Possible outcomes: no refund, partial refund, full refund, refund
   plus a goodwill credit, damage amount payable by the Driver, or no finding where the
   evidence does not support either side.
5. **Funds held.** Where a dispute is open, the Host payout for that booking is held until
   the dispute closes. See `21_Host_Terms.md` clause 7.3.
6. **Outcome applied.** Refunds go to the original payment instrument. Host payouts are
   released or adjusted. Every step writes an audit row.
7. **The Platform decides a refund, not liability in law.** A Platform decision resolves
   what happens to the money held in the transaction. It does not determine either party's
   legal rights, and neither party gives up any legal remedy by using the process.

**REVIEW REQUIRED:** whether a Platform decision on a dispute needs any particular process
to be fair, whether the 72 hour raise window is enforceable against a consumer, and whether
an internal decision can be presented as final. See `20_Legal_Requirements.md` section 10.

---

## 11. Refund timelines by payment method

Once a refund is approved, the Platform initiates it within **1 business day**. How long it
then takes to appear depends entirely on the payment method and the banks involved, and
that part is outside the Platform's control.

| Method | Indicative time to appear after the Platform initiates |
| --- | --- |
| UPI | 1 to 3 business days |
| Debit card | 5 to 7 business days |
| Credit card | 5 to 7 business days, and may appear on the next statement cycle |
| Net banking | 3 to 7 business days |
| Wallet (third party) | 1 to 3 business days |
| Platform wallet credit, where the Driver chooses it | Immediate |

Rules:

1. Refunds return **only** to the original payment instrument. A refund cannot be
   redirected to a different card, account or person. This is both a regulatory position
   and a fraud control.
2. The Platform provides a refund reference as soon as the payment provider issues one, so
   the Driver can raise it with their own bank.
3. Where the original instrument has expired or been closed, the Driver must contact
   support, and the refund is handled through the payment provider's process for that
   situation, which is slower.
4. A Driver may elect to take a refund as Platform wallet credit for immediate
   availability. That election must be genuinely optional and must never be the default.
5. **REVIEW REQUIRED:** whether a statutory maximum refund timeline applies under consumer
   protection e-commerce rules, and whether the indicative times above may be published as
   ranges or must be stated as a commitment. Do not publish these figures until the payment
   aggregator confirms its own actual timelines.

---

## 12. Escalation ladder

| Step | Who | Channel | Timeline |
| --- | --- | --- | --- |
| 1 | Message the other party | In-Platform message thread on the booking | Most issues resolve here within an hour |
| 2 | Open a dispute | The booking screen, Report a problem | Raise within 72 hours of the booking ending |
| 3 | Support review | `support` role, then `admin` where a refund or a payout is involved | Decision within 5 business days |
| 4 | Internal appeal | Reply on the closed dispute with new information | Reviewed by a different `admin` within 5 business days |
| 5 | Grievance Officer | `[GRIEVANCE OFFICER NAME]`, `[GRIEVANCE OFFICER EMAIL]`, `[REGISTERED ADDRESS]` | Acknowledged within 48 hours, substantive response target 30 days |
| 6 | External remedies | Consumer forum or other lawful remedy, and the Driver's own bank or card issuer for a payment dispute | As those bodies provide |

Nothing in this ladder requires a user to exhaust the internal steps before pursuing an
external remedy, and nothing in it limits any right a user has under applicable consumer
protection law.

---

## 13. Summary table

For a Rs 500 booking, total paid Rs 529.50. Tax of Rs 4.50 is remitted in every row and is
omitted from the columns.

| Scenario | Driver gets back | Host keeps | Platform keeps |
| --- | --- | --- | --- |
| `flexible`, cancelled more than 1 hour out | Rs 500.00 | Rs 0.00 | Rs 25.00 |
| `flexible`, cancelled inside 1 hour | Rs 0.00 | Rs 450.00 | Rs 75.00 |
| `moderate`, cancelled more than 24 hours out | Rs 500.00 | Rs 0.00 | Rs 25.00 |
| `moderate`, cancelled inside 24 hours | Rs 250.00 | Rs 225.00 | Rs 50.00 |
| `strict`, cancelled more than 48 hours out | Rs 250.00 | Rs 225.00 | Rs 50.00 |
| `strict`, cancelled inside 48 hours | Rs 0.00 | Rs 450.00 | Rs 75.00 |
| `non_refundable`, any time after confirmation | Rs 0.00 | Rs 450.00 | Rs 75.00 |
| Host cancels | Rs 529.50 | Rs 0.00 | Rs 0.00 |
| Platform cancels for Host fault or fraud | Rs 529.50 | Rs 0.00 | Rs 0.00 |
| Platform cancels for Driver breach | Per the applicable policy row above | Per policy | Per policy |
| Driver no-show, `moderate` Space | Rs 250.00 | Rs 225.00 | Rs 50.00 |
| Space unavailable on arrival | Rs 529.50 | Rs 0.00 | Rs 0.00 |
| Access failure, Host fault | Rs 529.50 | Rs 0.00 | Rs 0.00 |
| Access failure, Driver fault | Per the applicable policy row above | Per policy | Per policy |
| Dispute decided in the Driver's favour | Up to Rs 529.50, as decided | As decided | As decided |
| Booking completed normally | Rs 0.00 | Rs 450.00 | Rs 75.00 |

---

## 14. Open items before publication

| # | Section | Question | Professional |
| --- | --- | --- | --- |
| 1 | 1 | Tax base, and the treatment of tax on refunded and retained amounts | Chartered accountant |
| 2 | 2 | Confirm the `flexible` outside-window rule is zero | Product, then advocate |
| 3 | 2 | Whether commission is charged on a forfeited amount | Chartered accountant, product |
| 4 | 6 | Enforceability of `non_refundable` against a consumer | Advocate |
| 5 | 7.3 | Whether the rebooking cost cover may be published as a commitment | Founder, then advocate |
| 6 | 10 | Fairness of the dispute process, the 72 hour window, and finality | Advocate |
| 7 | 11 | Statutory refund timelines and the provider's actual timelines | Advocate, payment aggregator |
