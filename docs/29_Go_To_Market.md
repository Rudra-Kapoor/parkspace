# ParkSpace: Go To Market

> Derived from `00_SPEC_KERNEL.md`, section 12: Kolkata first, launch neighbourhoods in priority
> order Park Street, Esplanade, Camac Street, Salt Lake Sector V, Ballygunge, New Town. Target is
> **150 live spaces inside a 2 km radius before any driver acquisition spend begins.**
>
> North Star Metric throughout: **successfully completed parking hours per week.**

## 1. The chicken and egg problem, and our answer

A parking marketplace is worthless to a driver until there is a space near where she is going, and
worthless to a host until a driver books it. Spend on both sides at once and you burn money making
two disappointed audiences. This is the standard marketplace trap and there are only three ways out:
subsidise both sides, fake one side, or sequence.

**We sequence, and we start with supply.** The reasoning is specific to this market, not generic
marketplace doctrine.

1. **Supply is slower to build, so it must start earlier.** A driver can be acquired in an afternoon
   with a search result. A host requires a conversation at a gate, photographs, verification and a
   first payout. Host recruitment has a multi-week cycle time that no amount of money compresses.
2. **Supply creates the demand channel.** Every listed space becomes a location page, a map pin and
   a search result for a query someone is already typing. Supply is our distribution.
3. **Demand without supply is destroyed permanently, supply without demand is only disappointed.**
   A driver who searches and finds nothing does not come back. A host who lists and waits three
   weeks will usually still be there, provided we told her honestly that it would take three weeks.
4. **The product's core promise fails at low density.** Below roughly 150 spaces in a 2 km radius,
   the answer to "is there a space near me" is often no, and the guarantee becomes noise.

Hence the density gate, and hence the hard rule: **no rupee is spent acquiring drivers until 150
live, verified, bookable spaces exist inside the 2 km radius centred on Park Street.** Organic
demand, SEO pages and warm introductions all continue during the supply phase. Paid acquisition
waits.

### The seeded-demand exception

Pure supply-first has one flaw: a host who earns nothing for a month churns. We therefore run
**seeded demand** during the supply phase, at deliberately small scale: a waiting list of drivers
recruited at office parks and from society WhatsApp groups, invited to book manually at a discount
we absorb. The goal is not volume. It is that every host in the first 100 gets **at least one real
booking within 14 days of going live.** This is a retention cost, booked as such, not a growth
programme.

## 2. The 90-day Kolkata plan

Geography for days 1 to 90 is the 2 km radius around Park Street, which covers Park Street,
Esplanade, Camac Street and reaches towards Ballygunge. Salt Lake Sector V and New Town are phase 2
from day 60. Team assumed: two founders, two field agents from week 3, one support person from week 7.

### Phase 1, days 1 to 30: ground truth and the first 40 hosts

| Week | Milestone | Success measure |
| --- | --- | --- |
| 1 | Run the validation programme from `04_Market_Research.md`: transect counts and empty-bay audits on Park Street, Camac Street and one Ballygunge lane, at 11:00, 15:00 and 20:00 | A written count of empty private off-street bays per 500 metres. This number drives everything after it |
| 1 | Build the street-by-street supply map: every visible off-street bay, owner type, best time to approach | 600+ candidate doors identified and geocoded |
| 2 | Founders knock the first 60 doors personally. No delegation. The pitch is rewritten nightly | 60 conversations, yes rate measured, top 5 objections documented verbatim |
| 2 | Product: listing wizard, photo upload, availability and verification working end to end on staging | A founder can list a real space in under 8 minutes |
| 3 | Hire and train 2 field agents. Training is 3 days of shadowing, not a slide deck | Agents independently achieve at least 60% of founder yes rate |
| 3 | **First 10 spaces live and verified** | 10 verified listings with night photographs and structured access instructions |
| 4 | Seeded demand: recruit a 150-driver waiting list from 3 office buildings and 4 society groups | 150 names with vehicle and destination |
| 4 | **40 spaces live.** First 20 real bookings completed at a subsidised rate | 20 completed bookings, zero unresolved disputes |

**Day 30 gate:** 40 live spaces, 20 completed bookings, and a documented host yes rate. If the yes
rate is below 15%, stop and rewrite the pitch before scaling the field team.

### Phase 2, days 31 to 60: density and the first commercial supply

| Week | Milestone | Success measure |
| --- | --- | --- |
| 5 | Commercial supply push: 25 restaurants, 10 small office buildings, 6 apartment societies approached | 8 commercial hosts signed, contributing 45+ bays |
| 5 | Ship `/parking/kolkata/[area]` pages for all six launch areas, generated from live inventory | 6 pages indexed, each showing real spaces |
| 6 | **80 spaces live.** Host referral programme launched | 15% of new hosts arriving via host referral |
| 6 | Monthly and recurring booking flow shipped. First monthly commuter bookings sold | 10 active monthly bookings |
| 7 | Hire support. Dispute flow, audit log and refund tooling live in admin | Median first response under 2 hours |
| 7 | **110 spaces live.** First corporate conversation opened with two Camac Street employers | 2 qualified corporate pipelines |
| 8 | Density audit: map live spaces against the 2 km radius and identify coverage holes street by street | A heat map showing every gap of more than 400 metres |
| 8 | **150 spaces live inside 2 km. DENSITY GATE PASSED** | Gate checklist in section 8 fully signed off |

**Day 60 gate:** the density gate. Paid driver acquisition does not begin until every item in
section 8 is green, regardless of what the calendar says.

### Phase 3, days 61 to 90: demand switched on

| Week | Milestone | Success measure |
| --- | --- | --- |
| 9 | Paid acquisition begins: search, local social, and physical placement at the 6 highest-traffic approach points | First 200 paid-acquired drivers, cost per activated driver measured |
| 9 | Windshield and gate-side campaign on the three worst-parked streets | 3,000 leaflets, redemption tracked by unique code per street |
| 10 | Event partnership: one venue, one event, pre-booked parking sold through the event's own channels | 100+ event bookings in a weekend |
| 10 | **250 spaces live.** Salt Lake Sector V supply push begins | 40 Sector V candidate doors knocked |
| 11 | Driver referral live: both sides credited on the referred driver's first completed booking | 12% of new drivers from referral |
| 11 | Corporate pilot: first 8-bay monthly contract signed | 1 signed corporate account with GST invoicing |
| 12 | **1,000 cumulative registered drivers, 400 of them having completed a booking** | Cohort table for weeks 9 to 12 built and reviewed |
| 12 | 90-day review: rewrite `04_Market_Research.md` assumptions with measured data | Every variable K1 to L2 replaced or explicitly reaffirmed |

**Day 90 targets:** 250 live spaces, 400 activated drivers, 2,000 completed bookings, roughly 7,000
completed parking hours per week, host 30-day survival above 75%.

## 3. The first 100 hosts

### Segment breakdown and why

| Segment | Target hosts | Target bays | Bays per host | Doors to knock | Assumed yes rate | Why this mix |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Residential driveway | 55 | 70 | 1.3 | 400 | 14% | Volume, geographic spread, referral engine |
| Shop or showroom frontage | 15 | 25 | 1.7 | 90 | 17% | Fast yes, fills gaps between residential clusters |
| Restaurant or banquet forecourt | 12 | 60 | 5.0 | 60 | 20% | Bay-dense, owner already thinks commercially |
| Small commercial building basement | 8 | 90 | 11.3 | 45 | 18% | The monthly inventory engine. Highest value per signature |
| Apartment society visitor bays | 6 | 45 | 7.5 | 30 | 20% | Slow to close, unlocks many bays and social proof |
| Clinic, school, place of worship | 4 | 30 | 7.5 | 25 | 16% | Counter-cyclical availability that fills our worst hours |
| **Total** | **100** | **320** | **3.2** | **650** | **15%** | |

Read this table as a workload statement: **650 doors for 100 hosts.** Two field agents at 25
qualified conversations a day reach 650 in about 13 working days of pure knocking, which is 5 to 6
calendar weeks once travel, callbacks and committee meetings are included. Any plan that assumes
faster is a plan that has not knocked on a door.

Yes rates above are assumptions. Week 2 exists specifically to replace them with measured numbers.

### The door-to-door pitch, residential

This is the script, to be said almost exactly like this. It is 40 seconds before the first pause.
Notice that money is the third thing mentioned, not the first.

> "Good morning. My name is Ritu, I am from ParkSpace, we are a Kolkata company. I am speaking to
> houses on this road because of the parking situation outside.
>
> I noticed your driveway has space for two cars and there is one parked. Is that right?
>
> Here is what we do. People who work in the offices on Camac Street need somewhere to park between
> about ten and six. We find them, we check who they are, we take their name, phone number and car
> number, and we only send them to you for the exact hours you choose. You decide the hours. You can
> block any day you want. You can say no to anyone.
>
> Nobody knocks on your door, nobody needs a key, and nobody comes when you have not agreed to it.
> They park, they leave, and the money reaches your bank account.
>
> Mrs Chatterjee on Store Road started three weeks ago. She gets Rs 200 a day, weekdays only, and
> she has never once had to come outside.
>
> I am not asking you to sign anything today. I can take four photos on my phone, set it up for you
> in about ten minutes, and you will see the exact request before anyone comes. If you do not like
> the first one, you say no and we stop. Shall I show you how it looks?"

**The five objections and the answers.** Agents memorise these.

| Objection | Answer |
| --- | --- |
| "Who are these people, is it safe?" | "You see their name, photo, phone number and car registration before you accept. You accept or decline each one. They never enter the house and there is a record of every booking." |
| "What if they do not leave?" | "The booking has a fixed end time. If they stay beyond it they are charged automatically and we call them. If it ever becomes a problem, we handle it, not you." |
| "What if my car is damaged, or theirs?" | "Nothing is driven by us and nobody handles keys. If there is a disagreement we have photographs, timestamps and a dispute process. You are never left to argue with a stranger yourself." |
| "How much really?" | "Depends on your hours. A weekday daytime bay on this road is roughly Rs 3,500 to Rs 5,000 a month. We take 10% and that is the only deduction. I can show you the exact number for your hours right now." |
| "Let me ask my son." | "Of course. Can I set it up while you are here so he can look at the actual listing tonight? Nothing goes live until you press the button. Here is my number and a card." |

### The commercial pitch, restaurant and building

Different opening, because the counterparty thinks in yield.

> "Your forecourt holds six cars and it is empty until about half past twelve. That is roughly 25
> unsold car-hours a day on space you are already paying rent on.
>
> We sell those hours to office staff nearby and send you the money. You set the cut-off, and we
> guarantee every car is gone before your service starts. If one is not, that is our cost and our
> phone call, not yours.
>
> Second thing, which is the part most restaurant owners actually care about. Once you are listed,
> your own Friday diners can pre-book your forecourt before they leave home. Your evening stops
> being a fight at the gate."

## 4. The first 1,000 drivers

No paid channel is switched on before the density gate. Channels are listed in the order they are
activated.

| # | Channel | Mechanism | Target drivers | Assumed cost per activated driver | Activates |
| --- | --- | --- | ---: | ---: | --- |
| 1 | Local SEO area pages | Organic ranking on area and venue queries | 250 | Rs 0 marginal | Day 35, compounding |
| 2 | Office-park field presence | Desk at building lobbies on Camac Street and Sector V, sign-ups with a first-booking credit | 200 | Rs 120 | Day 30 (seeded), scaled day 61 |
| 3 | Windshield and gate-side leaflets | Unique code per street, so response is measurable street by street | 150 | Rs 90 | Day 61 |
| 4 | Search advertising | Tight geographic and keyword targeting on high-intent area and venue queries | 180 | Rs 250 | Day 61 |
| 5 | Local social and neighbourhood groups | Society and locality WhatsApp and Facebook groups, community-first, never spam | 120 | Rs 60 | Day 40 |
| 6 | Event partnerships | Parking sold inside the event's own booking flow | 100 | Rs 40 | Day 70 |
| 7 | Driver referral | Both sides credited on the referred driver's first completed booking | 120 | Rs 150 in credit | Day 75 |
| 8 | Hospital and clinic placement | Signage and reception cards at three high-footfall sites | 80 | Rs 70 | Day 80 |
| | **Blended** | | **1,000+** | **about Rs 110** | |

Costs are assumptions. The one that must be watched is channel 4: search advertising is the easiest
channel to overspend on and the easiest to mistake for growth, because it converts existing intent
rather than creating habit. Cap it until cohort retention is measured.

**Activation, not registration, is the metric.** A registered driver who never completes a booking
is worth nothing, and counting registrations is how marketplaces lie to themselves. Every number in
the table above means a driver who completed a first booking.

## 5. Local SEO page strategy

Parking is one of the few consumer categories where intent is almost perfectly expressed as
"parking near X". That makes programmatic local pages the highest-leverage free channel we have, and
the kernel already scopes local SEO pages into the MVP.

### Route structure

```
/parking/[city]                          /parking/kolkata
/parking/[city]/[area]                   /parking/kolkata/park-street
/parking/[city]/[area]/[sub]             /parking/kolkata/salt-lake/sector-v
/parking/[city]/near/[venue]             /parking/kolkata/near/victoria-memorial
/monthly-parking/[city]/[area]           /monthly-parking/kolkata/camac-street
/airport-parking/[city]                  /airport-parking/kolkata
```

### What each area page must contain

1. A live map of real available spaces, using jittered coordinates per kernel section 10.
2. A live count and an indicative price range, both computed from actual inventory.
3. A **monthly** section with its own price range, because monthly demand queries are commercially
   the most valuable and are usually served badly by everyone.
4. Genuinely local written content: which streets are hardest, when the peak is, where the one-ways
   are, walking distances to the main destinations. Written by someone who has been there.
5. Real reviews of spaces in that area.
6. Links to adjacent areas and to the venue pages inside that area.
7. A host call to action, because a homeowner in Ballygunge searching for parking is a supply lead.

### Rules

- **Never publish a page with no inventory.** A page showing zero spaces is worse than no page: it
  ranks, disappoints, and teaches the search engine that we are a bad result. Pages go live when the
  area has a minimum of 8 live spaces.
- **One page per area, not per space.** Individual listing pages are noindexed until an area has
  depth, to avoid a thin-content footprint.
- **Programmatic, but not generic.** The map and the counts are generated. The local paragraphs are
  written once, by hand, per area. Six areas is 6 pieces of writing, not 600.
- **Venue pages are the event wedge.** "Parking near [venue]" is the highest-intent query in the
  category and it aligns exactly with the event persona.

## 6. Partnership targets

| Partner type | Specific targets | What we want | What they get | Priority |
| --- | --- | --- | --- | --- |
| Event venues and organisers | Large auditoriums, stadium events, exhibition grounds, Durga Puja committees in the launch areas | Parking offered inside their own ticket or information flow | A solved parking complaint, and a revenue share | High, day 70 |
| Employers on Camac Street and Sector V | Firms of 40 to 300 staff | Monthly bays sold as a staff benefit | A retention and punctuality benefit at no capital cost | High, day 55 |
| Hospitals and diagnostic centres | Two large private hospitals in or near the launch radius | Visitor parking overflow | Fewer complaints, a calmer forecourt | Medium, day 80 |
| Apartment society federations | Ballygunge and Salt Lake associations | Bulk supply, visitor bay monetisation | A new income line for the society corpus | High, continuous |
| Restaurant associations | Park Street and Camac Street clusters | Off-peak supply and evening pre-booking | Covers they currently lose to parking | High, day 40 |
| Driving schools and car dealerships | Service centres and dealers in the launch areas | Driver acquisition at the point of car ownership | A value-add for their customers | Low, opportunistic |
| Payments and fuel apps | Wallet and fuel applications with local reach | Distribution to drivers already transacting | A relevant new category | Low, year 2 |

Partnership discipline: we do not sign a partnership that requires engineering work before the
density gate. Until then, every partnership is a spreadsheet, a landing page and a phone number.

## 7. Referral mechanics

Referral is our cheapest channel and the only one with a chance of matching the social dynamics of
the informal market. Two separate programmes, because hosts and drivers are motivated by different
things.

### Host referral

- Trigger: the referred host completes their **third** booking, not their first, and not on signup.
- Reward: **Rs 500** to the referrer, **Rs 500** to the new host, paid as cash into the payout
  account, not as credit. A host wants money, not a coupon.
- Why third booking: it filters out listings that were never serious and aligns the reward with real
  supply.
- Distribution: in the month-one earnings summary, which is the moment a host feels good, and
  verbally by the field agent at the first payout.
- Cap: 5 rewarded referrals per host per quarter, to prevent farming.

### Driver referral

- Trigger: the referred driver **completes** a first booking. Not registration, not a hold.
- Reward: **Rs 150** wallet credit each side. Credit, not cash, because it drives a second booking.
- Expiry: 60 days, stated plainly at the time of issue.
- Fraud controls: one reward per unique vehicle registration and per payment instrument, device
  fingerprinting, and no reward when referrer and referred share a payment method.

### Cross-side referral

- A host who refers a driver, or a driver who refers a host, earns the host reward. Some of our best
  supply leads will come from drivers who noticed an empty driveway, and some of our best drivers
  are hosts' neighbours.

## 8. Launch readiness checklist

Nothing below is optional. Paid driver acquisition begins only when every line is green, signed off
by name and date.

### The density gate

| # | Criterion | Threshold | Why |
| --- | --- | --- | --- |
| G1 | **Live, verified, bookable spaces inside a 2 km radius of Park Street** | **150** | Kernel section 12. The non-negotiable one |
| G2 | Maximum coverage gap between adjacent live spaces | No gap greater than 400 metres in the core | 400 metres is the walk a driver accepts |
| G3 | Share of live spaces available during the 09:00 to 19:00 weekday window | 60% or more | Our primary demand window |
| G4 | Spaces available overnight or monthly | 35 or more | The margin engine |
| G5 | Spaces with covered or gated parking | 40 or more | Required by the resident and airport personas |

### Product readiness

| # | Criterion | Threshold |
| --- | --- | --- |
| P1 | End-to-end booking loop passing on production: search, quote, hold, pay, confirm, check in, check out, complete | 100% of a 20-case manual script |
| P2 | Concurrency test against the exclusion constraint: 50 simultaneous attempts on one bay | Exactly one confirmed, 49 clean `SPACE_NO_LONGER_AVAILABLE` |
| P3 | Payment reconciliation | 100% of test bookings reconcile to the paise |
| P4 | Cancellation and refund flows for all four policies | Verified against kernel section 8, unit tested |
| P5 | Location privacy rule enforced at the row level, verified by an unauthenticated API probe | Exact coordinates unreachable pre-confirmation |
| P6 | Area pages live and indexed | All six, each with 8 or more live spaces |
| P7 | Mobile page load on a mid-range Android over 4G | Under 3 seconds to interactive |

### Operational readiness

| # | Criterion | Threshold |
| --- | --- | --- |
| O1 | Support coverage during 07:00 to 22:00 | Named person, tested escalation path |
| O2 | Median first response to a dispute | Under 2 hours |
| O3 | Every live space has night photographs and structured access instructions | 100% |
| O4 | Every host has completed a first payout, or has a scheduled date they have been told | 100% |
| O5 | Field team capacity to add 40 spaces a month, sustained | 2 trained agents |
| O6 | Admin tooling: moderation, refunds, disputes, audit log | Live and exercised on real cases |

### Trust readiness

| # | Criterion | Threshold |
| --- | --- | --- |
| T1 | Host verification completed for every live space | 100% |
| T2 | Two-sided review system live | Yes |
| T3 | Terms, privacy policy, cancellation policy and host agreement published and reviewed by a lawyer | Yes |
| T4 | GST and invoicing position confirmed by a chartered accountant | Yes, per `20_Legal_Requirements.md` |
| T5 | Incident response plan for a vehicle damage claim, written and rehearsed | Yes |

**The rule that survives contact with impatience:** if G1 is not met, we do not spend on drivers.
Not a smaller budget, not a test campaign, not a pilot. The gate exists because the temptation to
skip it will be strongest exactly when skipping it is most damaging.
