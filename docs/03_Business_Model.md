# ParkSpace: Business Model and Unit Economics

> Derived from `00_SPEC_KERNEL.md`, section 7 (money model) and section 8 (cancellation policies).
> All amounts are integer paise in the system. This document shows rupees for readability.
>
> **Everything numeric below is an illustrative model built on stated assumptions. It is not a
> forecast, not a projection presented as fact, and not validated against live data. Every
> assumption is named so it can be attacked.**

## 1. How the company makes money

ParkSpace is a take-rate marketplace. The platform never buys inventory and never holds stock. It
charges both sides of a transaction it made possible, and layers subscription and software revenue
on top once density exists.

Revenue streams, in the order we build and defend them.

| # | Stream | Mechanism | Default rate | Status |
| --- | --- | --- | --- | --- |
| 1 | Host commission | Deducted from the host's gross before payout | `HOST_COMMISSION_PCT` = 10% | Live at MVP |
| 2 | Driver service fee | Added to the driver's total, GST applied on the fee | `DRIVER_SERVICE_FEE_PCT` = 5% | Live at MVP |
| 3 | Host subscription | Optional monthly plan: lower commission, priority placement, calendar sync, faster payouts | Assumption: Rs 299 per month | Post-MVP |
| 4 | Business and operator SaaS | Per-location monthly fee for the `operator` role: staff seats, gate control, multi-location reporting | Assumption: Rs 1,500 to Rs 6,000 per location per month | Post-MVP |
| 5 | Featured listings | Paid placement inside a neighbourhood search result, clearly labelled | Assumption: Rs 500 per space per month | Post-MVP |
| 6 | EV charging commission | Commission on energy delivered at a host bay with a charger | Assumption: 8% of energy value | Year 2+ |
| 7 | B2B API | Per-booking or per-seat access for navigation apps, hospitals, event ticketing, fleets | Assumption: Rs 10 per booking or negotiated | Year 2+ |

Streams 1 and 2 are the only ones the MVP depends on. Streams 3 to 7 are monetisation of density
that already exists. If we need streams 3 to 7 to make the unit economics work, the unit economics
do not work.

Both default rates live in `platform_settings` and are changeable at runtime. That is deliberate:
take rate is the single most important experiment the company will run in year 1.

## 2. The money model, restated

From kernel section 7, with `discount_amount` zero in the base case.

```
taxable_amount   = base_amount - discount_amount
service_fee      = round(taxable_amount * DRIVER_SERVICE_FEE_PCT)
tax_amount       = round(service_fee * GST_PCT)
total_amount     = taxable_amount + service_fee + tax_amount
host_commission  = round(taxable_amount * HOST_COMMISSION_PCT)
host_payout      = taxable_amount - host_commission
platform_revenue = service_fee + host_commission
```

`tax_amount` is collected on behalf of the government and is never revenue. The gross take rate is
therefore 15% of the taxable amount, split 10 points from the host and 5 points from the driver.

> The GST treatment shown here follows the kernel literally: GST is applied to the service fee only.
> Whether GST also attaches to the host commission, whether the platform is an aggregator liable for
> tax on the full supply, and the TDS and TCS position under section 194-O are open questions that a
> chartered accountant must settle before real money moves. See `20_Legal_Requirements.md`. The code
> isolates this inside `lib/pricing/tax.ts`.

## 3. Worked contribution margin: one booking of Rs 300

A driver books a Ballygunge driveway for four hours. The host's price works out to Rs 300 base. No
coupon, no wallet credit.

### 3.1 The transaction in paise

| Line | Formula | Paise | Rupees |
| --- | --- | --- | --- |
| `base_amount` | host price for the interval | 30,000 | 300.00 |
| `discount_amount` | none | 0 | 0.00 |
| `taxable_amount` | base minus discount | 30,000 | 300.00 |
| `service_fee` | round(30,000 x 0.05) | 1,500 | 15.00 |
| `tax_amount` | round(1,500 x 0.18) | 270 | 2.70 |
| **`total_amount`** | driver pays | **31,770** | **317.70** |
| `host_commission` | round(30,000 x 0.10) | 3,000 | 30.00 |
| **`host_payout`** | host receives | **27,000** | **270.00** |
| **`platform_revenue`** | fee plus commission | **4,500** | **45.00** |

Gross take on gross booking value: 45.00 / 300.00 = **15.0%**.

### 3.2 Variable cost stack

Every figure in this table is an assumption to be replaced with measured data after the first 1,000
bookings. The validation method is given so the assumption can be killed cleanly.

| Cost | Assumption | Rs | How to validate |
| --- | --- | --- | --- |
| Payment gateway | 2.0% of `total_amount` plus 18% GST on the fee, on Rs 317.70 | 7.50 | Read the actual settlement report for one month |
| Host payout transfer | Rs 3.00 per payout, payouts batched, assume 4 bookings per batch | 0.75 | Count payout events against booking count |
| Transactional messaging | 2 SMS plus push per booking at Rs 0.25 | 0.50 | Provider invoice divided by booking count |
| Support and disputes | 2% dispute rate at Rs 100 fully loaded handling cost | 2.00 | Ticket count and average handling time from the admin log |
| Refund and goodwill provision | 1 in 100 bookings refunded at platform cost after a host no-show | 1.00 | Refund ledger against booking count |
| **Total variable cost** | | **11.75** | |

### 3.3 Contribution

| Line | Rs | As % of GBV |
| --- | --- | --- |
| Platform revenue | 45.00 | 15.0% |
| Variable cost | (11.75) | (3.9%) |
| **Contribution margin** | **33.25** | **11.1%** |

Contribution margin ratio on net revenue: 33.25 / 45.00 = **73.9%**.

This is the number the entire business rests on. At Rs 33.25 of contribution per booking, a driver
acquired for a fully loaded Rs 250 pays back after roughly 8 completed bookings, which at the modelled
frequency of 4 bookings per active month is about 2 to 3 months of active life.

### 3.4 Sensitivity of the single booking

| Booking value | Platform revenue | Variable cost | Contribution | CM % of GBV |
| --- | --- | --- | --- | --- |
| Rs 60 (1 hour street-adjacent) | 9.00 | 4.83 | 4.17 | 6.9% |
| Rs 150 (2 hours retail) | 22.50 | 7.30 | 15.20 | 10.1% |
| Rs 300 (half day, base case) | 45.00 | 11.75 | 33.25 | 11.1% |
| Rs 600 (full working day) | 90.00 | 20.65 | 69.35 | 11.6% |
| Rs 3,500 (monthly office bay) | 525.00 | 107.25 | 417.75 | 11.9% |

The shape matters more than the values: small bookings are structurally unprofitable because the
fixed components of the cost stack do not shrink. Two consequences follow. `MIN_BOOKING_MINUTES` is
30 for an economic reason as well as a product reason, and monthly and recurring inventory is not a
nice-to-have, it is the margin engine.

## 4. Cohort model, 24 months

### 4.1 Assumptions, all named and all challengeable

| ID | Assumption | Value | Why this number, and how to kill it |
| --- | --- | --- | --- |
| A1 | Activated drivers acquired in month 1 | 60 | Post-density-gate launch cohort from organic and field channels only |
| A2 | Monthly acquisition growth | +60 to +150 new drivers per month, linear ramp to 3,250 in month 24 | Linear, not exponential, because supply density gates demand. Validate against actual monthly signups that complete a first booking |
| A3 | Retention by month of life | m1 100%, m2 55%, m3 42%, m4 36%, m5 32%, m6 30%, settling to 24% from m12 | Marketplace cohorts typically collapse then flatten. Validate at month 4 with real cohort tables |
| A4 | Bookings per active driver per month | 2.0 in life-month 1, 3.0 in months 2 to 3, 4.0 thereafter | Habit forms around a commute. Validate with a frequency histogram, not an average |
| A5 | Average gross booking value | Rs 300, held flat | Deliberately flat so growth is not flattered by price. Validate with the actual GBV distribution |
| A6 | Gross take rate | 15% (10% host, 5% driver) | Kernel defaults |
| A7 | Variable cost per booking | Rs 11.75 | Section 3.2 |
| A8 | Average booked duration | 3.5 hours | Used only to translate bookings into the North Star Metric |
| A9 | Supply is never the binding constraint | Assumed true | **This is the most dangerous assumption in the model.** It is false without the 90-day supply plan in `29_Go_To_Market.md` |

### 4.2 Modelled output

Rs lakh = Rs 100,000. Rs cr = Rs 10,000,000.

| Month | New drivers | Cumulative drivers | Active drivers | Bookings | GBV (Rs lakh) | Net revenue (Rs lakh) | Contribution (Rs lakh) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 60 | 60 | 60 | 120 | 0.36 | 0.05 | 0.04 |
| 2 | 120 | 180 | 153 | 339 | 1.02 | 0.15 | 0.11 |
| 3 | 200 | 380 | 291 | 674 | 2.02 | 0.30 | 0.22 |
| 4 | 300 | 680 | 482 | 1,168 | 3.50 | 0.53 | 0.39 |
| 5 | 420 | 1,100 | 731 | 1,837 | 5.51 | 0.83 | 0.61 |
| 6 | 560 | 1,660 | 1,045 | 2,705 | 8.11 | 1.22 | 0.90 |
| 7 | 700 | 2,360 | 1,409 | 3,752 | 11.26 | 1.69 | 1.25 |
| 8 | 850 | 3,210 | 1,827 | 4,989 | 14.97 | 2.24 | 1.66 |
| 9 | 1,000 | 4,210 | 2,292 | 6,404 | 19.21 | 2.88 | 2.13 |
| 10 | 1,150 | 5,360 | 2,798 | 7,987 | 23.96 | 3.59 | 2.66 |
| 11 | 1,300 | 6,660 | 3,346 | 9,732 | 29.20 | 4.38 | 3.24 |
| 12 | 1,450 | 8,110 | 3,933 | 11,632 | 34.90 | 5.23 | 3.87 |
| 13 | 1,600 | 9,710 | 4,557 | 13,685 | 41.05 | 6.16 | 4.55 |
| 14 | 1,750 | 11,460 | 5,219 | 15,886 | 47.66 | 7.15 | 5.28 |
| 15 | 1,900 | 13,360 | 5,917 | 18,234 | 54.70 | 8.21 | 6.06 |
| 16 | 2,050 | 15,410 | 6,652 | 20,728 | 62.18 | 9.33 | 6.89 |
| 17 | 2,200 | 17,610 | 7,423 | 23,366 | 70.10 | 10.51 | 7.77 |
| 18 | 2,350 | 19,960 | 8,230 | 26,149 | 78.45 | 11.77 | 8.69 |
| 19 | 2,500 | 22,460 | 9,073 | 29,075 | 87.23 | 13.08 | 9.67 |
| 20 | 2,650 | 25,110 | 9,952 | 32,146 | 96.44 | 14.47 | 10.69 |
| 21 | 2,800 | 27,910 | 10,867 | 35,360 | 106.08 | 15.91 | 11.76 |
| 22 | 2,950 | 30,860 | 11,818 | 38,719 | 116.16 | 17.42 | 12.87 |
| 23 | 3,100 | 33,960 | 12,805 | 42,221 | 126.66 | 19.00 | 14.04 |
| 24 | 3,250 | 37,210 | 13,828 | 45,868 | 137.60 | 20.64 | 15.25 |

### 4.3 Rollups

| Measure | Months 1 to 12 | Months 1 to 24 |
| --- | ---: | ---: |
| Completed bookings | 51,338 | 392,774 |
| Gross booking value | Rs 1.54 cr | Rs 11.78 cr |
| Net revenue | Rs 23.1 lakh | Rs 176.7 lakh |
| Contribution margin | Rs 17.1 lakh | Rs 130.6 lakh |
| Month-24 exit run rate (net revenue x 12) | | Rs 2.48 cr |
| Month-24 North Star Metric, at A8 | | about 37,000 completed parking hours per week |

Note what this model does **not** claim. It does not include fixed cost, salaries, field operations,
marketing spend or support headcount. Contribution margin is not profit. A field-led supply model in
one city plausibly carries Rs 15 to Rs 25 lakh per month of fixed and semi-fixed cost by month 24,
which the contribution line above does not yet cover. Reaching operating break-even requires either
a second city sharing the same fixed base, the layered revenue streams 3 to 7, or a higher take
rate. That gap is the fundraising case, and it is stated here rather than hidden.

## 5. Sensitivity: take rate against repeat rate

The two variables that decide whether this is a business are how much we take and how often people
come back. Everything else is a rounding error by comparison.

The grid holds acquisition constant at A2 and varies the steady-state retention tail from A3 by a
factor of 0.75 and 1.25, then applies three take rates. Values are **month-24 monthly net revenue in
Rs lakh**.

| Steady-state repeat rate | Take rate 10% | Take rate 15% (base) | Take rate 20% |
| --- | ---: | ---: | ---: |
| 18% (tail x 0.75) | 10.81 | 16.21 | 21.62 |
| 24% (base) | 13.76 | **20.64** | 27.52 |
| 30% (tail x 1.25) | 16.71 | 25.07 | 33.43 |

Month-24 monthly bookings under the same retention variants: 36,026 at 18%, 45,868 at 24%, 55,710
at 30%.

Three readings from this grid.

1. **Retention and take rate move revenue by almost the same magnitude.** A 6 point improvement in
   the steady-state repeat rate is worth roughly as much as 5 points of take rate. Retention is
   cheaper to buy and does not risk the supply base, so it is the first lever.
2. **The 20% column is not free.** Every point of take rate above 15 raises host churn and drives
   off-platform leakage, where a repeat driver and a repeat host agree to transact in cash. The
   model cannot see that effect. Before moving take rate we must be able to measure leakage, for
   example by watching repeat pairs whose booking frequency falls while both accounts stay active.
3. **The downside case still works at the unit level.** Even the worst cell, 10% take and 18%
   repeat, produces positive contribution per booking. The risk in this business is not negative
   unit economics, it is failing to reach density at all.

## 6. Cancellation and refund economics

From kernel section 8. These rules have a direct P&L consequence.

| Policy | Driver cancels | Platform keeps | Host receives |
| --- | --- | --- | --- |
| `flexible` | Full refund of `taxable_amount` up to 1 hour before start | Service fee and its GST | Nothing |
| `moderate` | Full refund up to 24 hours before, half after | Service fee, plus commission on the retained half | Half of the retained taxable amount less commission |
| `strict` | Half up to 48 hours before, nothing after | Service fee, plus commission on whatever is retained | The retained portion less commission |
| `non_refundable` | Nothing once confirmed | Full commission and service fee | Full payout less commission |

When the **host** cancels, the service fee is refunded to the driver, the platform earns nothing on
that booking, and the host takes a reliability penalty. Host cancellation is therefore a pure loss
event: we pay the gateway cost, refund everything, and damage the driver's trust. The model assumes
a host cancellation rate low enough to sit inside the Rs 1.00 per booking refund provision in
section 3.2. If host cancellations exceed roughly 3% of confirmed bookings, that provision is wrong
and the contribution margin falls.

## 7. What would break this model

Written down now so it cannot be claimed later that nobody saw it coming.

- **Supply churn.** A host who lists, earns Rs 400 and delists has cost us more to recruit than she
  will ever return. Host 90-day survival is a first-class metric, not a vanity one.
- **Off-platform leakage.** The classic marketplace disease. A driver who parks at the same
  driveway every weekday has an obvious incentive to pay the host directly. The defence is making
  the platform worth its 15%: the guarantee, the access instructions, the receipt, the dispute
  path, the automatic monthly renewal.
- **Small-basket mix.** If the booking mix drifts towards Rs 60 one-hour bookings, contribution per
  booking halves. Monitor average GBV weekly.
- **Payment cost.** A 2% assumption is generous to us. If the effective rate lands at 2.5% plus GST,
  Rs 2.00 of contribution per booking disappears.
- **Tax reclassification.** If GST attaches to the full supply value rather than the fee, the entire
  pricing surface changes. This is a live, unresolved question.
