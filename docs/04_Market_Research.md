# ParkSpace: Market Research

> Derived from `00_SPEC_KERNEL.md`, section 12 (first market: Kolkata).
>
> **A note on rigour that governs this entire document.** There is no public dataset that gives the
> number of private off-street parking bays in an Indian city, their occupancy, or the cash value of
> parking transactions. Anyone who quotes such a figure with a source is either citing a paid
> consulting report of unknown method or inventing it. This document therefore contains **no
> citations and no statistics attributed to named sources.** Every number is a named assumption or
> a named estimate, written as a variable, with a stated method for validating or destroying it. A
> reader who disagrees with a number should change the variable and recompute, and the model is
> built so that is a one-line change.

## 1. Demand drivers in Indian cities

### 1.1 Vehicle registrations grow faster than parking supply

The structural condition is simple. Private four-wheeler ownership in Indian metros has grown for
two decades. Off-street parking supply grows only when a new building is constructed, and new
buildings are constrained by land. The result is a widening gap between vehicles that need to be
parked and formal bays that exist to park them, absorbed by the kerbside and by informal
arrangements.

*What we assume:* the four-wheeler base in the Kolkata urban agglomeration is growing and will
continue to grow at a mid-single-digit annual rate.
*How to validate:* request year-on-year registration counts for LMV-NT category vehicles for the
Kolkata RTOs from the West Bengal Transport Department, or reconstruct the trend from the Vahan
public dashboard. This is a genuinely obtainable number and should be obtained rather than assumed.

### 1.2 Urban density means the parking is already there, just not visible

Kolkata is among the densest large cities in India. Density has a counter-intuitive effect on this
business: it means that within 300 metres of almost any destination there are dozens of private
off-street bays. High density is what makes a marketplace feasible at all, because walking distance
from a listed bay to the destination is short enough to be acceptable.

*What we assume:* a driver will accept a 400 metre walk from a guaranteed bay to the destination.
*How to validate:* in the first 500 bookings, plot completion rate against straight-line distance
from bay to stated destination and find the distance at which cancellations rise.

### 1.3 Off-street supply is fragmented and privately held

This is the single most important structural fact in this document, and it cuts both ways.

No single entity controls meaningful off-street parking supply in Kolkata. It sits with individual
homeowners, apartment societies, small commercial buildings, shops, restaurants, clinics and small
office blocks. There is no municipal registry of it, no operator aggregating it, and no way to buy
it in bulk.

That fragmentation is why nobody has already solved this: it cannot be solved with a purchase order
or a partnership. It has to be assembled door to door. It is also why it is defensible: the
assembled supply base is expensive to replicate, and the second entrant into a neighbourhood has to
recruit the same doors a second time with a worse offer.

*How to validate the fragmentation claim:* walk a 500 metre transect of Park Street and record, for
every off-street bay visible from the road, who controls it. If more than 20% sits with any single
owner, this assumption is wrong for that neighbourhood.

### 1.4 Digital payments penetration removes the last friction

UPI made a Rs 60 payment between two strangers, with no card and no cash, a normal daily act across
income levels. A parking marketplace in India was structurally impossible before this: the average
transaction is too small to justify card rails and too frequent to justify cash reconciliation.

This matters on the supply side as much as the demand side. A homeowner host will accept a payout
into a bank account she checks on her phone. She would not accept a cheque, and she would not accept
having to invoice.

*What we assume:* essentially all target drivers and hosts in the launch neighbourhoods can
transact through UPI.
*How to validate:* during host recruitment, record the share of prospects who cannot or will not
give a UPI ID or bank account. If that share exceeds 15%, payout design needs rework.

### 1.5 The cost of the status quo is invisible and therefore under-priced

Cruising for parking costs fuel and time, and the cost is spread across the whole trip so nobody
attributes it. Our job in marketing is to make that cost legible: "you spent 14 minutes looking for
this space" is a stronger message than "parking from Rs 40 per hour".

*How to validate:* a simple shadowing study. Ride with 20 drivers into Park Street at peak and
stopwatch the interval between "arrived in the area" and "engine off". Report the median.

## 2. Demand segmentation

Six segments, ranked by how well they fit the product as specified in the kernel.

| # | Segment | Typical duration | Booking pattern | Fit | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | Office commuter | 9 to 10 hours | Recurring weekday, monthly | Excellent | Predictable, high GBV per booking, recurring inventory, low support load |
| 2 | Resident with a second vehicle | Monthly, overnight | Monthly, non-refundable | Excellent | Highest margin, near-zero marginal support cost, very sticky |
| 3 | Event visitor | 3 to 5 hours | Burst, date-driven | Strong | Willingness to pay peaks, but demand is lumpy and supply must be pre-committed |
| 4 | Hospital visitor and patient attendant | 2 to 8 hours, unpredictable end | Ad hoc, often same-day | Strong | Acute pain, low price sensitivity, but overstay rates are high and need careful policy |
| 5 | Airport and rail traveller | 1 to 14 days | Planned, high value | Strong | Long duration, high GBV, but requires host willingness to surrender a bay for days |
| 6 | Retail and dining | 1 to 3 hours | Ad hoc, evening and weekend peak | Moderate | High volume, low GBV, weakest contribution per booking. Valuable mainly for density and habit formation |

**The ordering has a strategic consequence.** Segments 1 and 2 carry the margin and the retention.
Segment 6 carries the volume and the brand. A launch that chases segment 6 first will look busy and
lose money. The go-to-market plan therefore anchors on commuters and residents and treats retail
demand as a by-product of the same supply.

## 3. Supply segmentation

| Supply type | Typical count of bays | Availability window | Recruitment difficulty | Notes |
| --- | --- | --- | --- | --- |
| Residential driveway or gate-side bay | 1 to 2 | Weekdays 09:30 to 19:00 | Low | The bread and butter. Highest count, highest churn |
| Apartment society visitor bays | 5 to 30 | Most of the day | High | Requires committee approval, but one yes unlocks many bays |
| Small commercial building basement | 10 to 60 | Nights, weekends, off-peak | Medium | Best monthly inventory. Needs the `operator` role |
| Restaurant or banquet forecourt | 4 to 20 | Daytime, before service | Medium | Owner understands revenue per square foot already |
| Shop or showroom frontage | 1 to 4 | Outside trading hours | Low | Easy yes, small inventory, often unreliable |
| Clinic, school, place of worship | 5 to 40 | Counter-cyclical to their own peak | Medium | Excellent counter-cyclical match with hospital and office demand |

## 4. Bottom-up market sizing

No top-down number is used anywhere below. The model builds from vehicles to parking events to
rupees, and every variable is named.

### 4.1 Variables

| ID | Variable | Value used | Basis | How to validate or destroy it |
| --- | --- | ---: | --- | --- |
| K1 | Registered private four-wheelers, Kolkata urban agglomeration | 1,300,000 | Estimate | Vahan dashboard or West Bengal Transport Department RTO counts. Obtainable, must be obtained |
| K2 | Share of that fleet in active use on a given weekday | 0.55 | Assumption | Survey 200 households on whether the car moved yesterday. Cross-check with a fuel-station intercept survey |
| K3 | Share of active-vehicle weekdays that produce at least one parking event in a location where paid off-street parking is plausible | 0.18 | Assumption | Trip-diary survey of 150 drivers over one week, coding each destination as CBD, commercial, hospital, retail, event or residential |
| K4 | Average willingness to pay per such parking event, blended across durations | Rs 120 | Estimate | Intercept survey at three locations plus observed prices charged by attendants. Note this is **lower** than our modelled average booking value of Rs 300 because the market average includes very short stays while our inventory skews long |
| D | Equivalent full-demand days per year, weekdays plus discounted weekends | 300 | Assumption | Compare a weekday and a Saturday transect count in the same location |
| K5 | Households and employees in Kolkata who need a dedicated monthly bay they do not have | 90,000 | Estimate | Count society waiting lists, plus employer surveys on staff parking shortfall |
| K6 | Share of those willing to source a monthly bay through a platform | 0.25 | Assumption | Offer a monthly bay to 100 qualified prospects and count acceptances |
| K7 | Average monthly bay price | Rs 2,500 | Estimate | Collect 50 actual monthly rates from society notice boards, brokers and classifieds |
| M | Share of total parking spend that occurs at private off-street bays a marketplace could actually list | 0.45 | Assumption. **The weakest variable in the model** | Transect audit: classify every parking event observed into kerbside, municipal lot, operator lot, and private off-street. Repeat in three neighbourhoods |
| T1 | Indian cities with density and vehicle economics comparable to Kolkata | 12 | Assumption | Rank cities by four-wheeler registrations per square kilometre of built-up area |
| T2 | Average size of those cities relative to Kolkata | 1.1 | Estimate | Same ranking exercise |
| L1 | Parking events per weekday across the six launch neighbourhoods where paid off-street parking is plausible | 26,000 | Estimate, roughly 20% of the Kolkata total | Transect counts, method in section 4.5 |
| L2 | Monthly bays addressable in the six launch neighbourhoods | 6,000 | Estimate | Employer and society census of the six neighbourhoods |

### 4.2 TAM: India urban off-street parking, marketplace-addressable

```
Kolkata transient parking spend
  = K1 x K2 x K3 x D x K4
  = 1,300,000 x 0.55 x 0.18 x 300 x 120
  = 128,700 relevant parking events per weekday
  = Rs 463.3 crore per year

Kolkata monthly-bay spend
  = K5 x K6 x K7 x 12
  = 90,000 x 0.25 x 2,500 x 12
  = 22,500 bays
  = Rs 67.5 crore per year

Kolkata total addressable parking spend = Rs 530.8 crore per year

India TAM (gross booking value)
  = Kolkata total x T1 x T2
  = 530.8 x 12 x 1.1
  = Rs 7,007 crore per year

India TAM, marketplace-addressable = TAM x M = Rs 3,153 crore per year GBV
India TAM, net revenue to a platform at 15% take = Rs 473 crore per year
```

### 4.3 SAM: Kolkata

```
Kolkata marketplace-addressable GBV = Rs 530.8 cr x M(0.45) = Rs 238.9 crore per year
Kolkata net revenue at 15% take                             = Rs 35.8 crore per year
```

### 4.4 SOM: six launch neighbourhoods, 24 months

```
Six-neighbourhood transient spend = L1 x D x K4
                                  = 26,000 x 300 x 120 = Rs 93.6 crore per year
Six-neighbourhood monthly spend   = L2 x K7 x 12
                                  = 6,000 x 2,500 x 12 = Rs 18.0 crore per year
Six-neighbourhood total           = Rs 111.6 crore per year
Marketplace-addressable           = x M(0.45) = Rs 50.2 crore per year
```

The cohort model in `03_Business_Model.md` reaches a month-24 annualised GBV of about **Rs 16.5
crore**, which is **roughly 33% of the marketplace-addressable spend in those six neighbourhoods.**

**We state plainly that this is aggressive.** A one-third share of addressable private off-street
parking spend in six dense neighbourhoods within 24 months implies near-default status in those
areas. It is achievable only if the density gate in `29_Go_To_Market.md` is met and supply keeps
pace. If it is not achievable, the honest conclusion is not that the market is too small, it is that
the timeline is too short: the same share reached in 36 or 42 months is still a good business.
Readers should treat the 33% as the model's loudest warning light rather than as a claim.

### 4.5 The validation programme

None of the above is worth anything until these are done. They are cheap, they take a fortnight, and
they should be completed before any significant spend.

1. **Transect counts.** Count every parked vehicle on a 500 metre transect of Park Street at 11:00
   on three consecutive weekdays, classifying each as kerbside, municipal lot, operator lot or
   private off-street. Repeat at 15:00 and 20:00. Repeat the entire exercise on Camac Street and in
   Salt Lake Sector V. This single exercise validates or destroys K3, K4 and M at once.
2. **Empty-bay audit.** On the same transects, count off-street bays that are visibly empty at
   11:00. This is the direct measure of the supply opportunity and it is the strongest slide in any
   fundraising deck, because it is observed rather than modelled.
3. **Cruise-time shadowing.** Ride with 20 drivers into a launch neighbourhood at peak and record
   the minutes between entering the area and switching off the engine.
4. **Price reality check.** Collect 50 actual prices: what attendants charge, what malls charge,
   what monthly bays rent for. Validates K4 and K7.
5. **Host willingness test.** Knock on 100 doors with the pitch in `29_Go_To_Market.md` and record
   the yes rate, the reasons for no, and the share that cannot transact digitally. Validates the
   entire supply plan, K6 and the UPI assumption.
6. **Trip-diary survey.** 150 drivers, one week, destination category coded daily. Validates K3,
   the most leveraged variable in the sizing.

If steps 1 to 6 return numbers materially worse than the assumptions above, the correct response is
to rewrite this document, not to explain away the data.

## 5. Why now, and why Kolkata first

**Why now:** UPI has removed payment friction, smartphone penetration has removed access friction,
and open mapping data plus free-tier infrastructure have removed the capital requirement for
building the product. A team can now reach a working marketplace without a map licence, a payment
gateway contract or a server bill.

**Why Kolkata:** extreme density, a large and growing private vehicle base, severe kerbside
contention in a small and well-defined commercial core, and a competitive field in which no
platform has established default status. The six launch neighbourhoods are close enough together
that a single field team can service them all, which is exactly what a density-first strategy
requires. A larger city would have diluted the same field effort across a much wider area.

## 6. Known gaps in this research

- We have no measured occupancy data for private off-street bays. Everything on the supply side is
  inference until the empty-bay audit is done.
- We have no measured price elasticity. K4 is a level estimate with no slope attached.
- We have no data on informal attendant pricing power or on how attendants will respond to a
  platform entering their street. That is a competitive question and a safety question, and it is
  treated in `05_Competitive_Analysis.md`.
- Seasonality is unmodelled. Kolkata's festival calendar plausibly produces demand swings large
  enough to distort any 90-day reading. D = 300 is a blunt instrument.
