# ParkSpace: Investor Pitch

> Derived from `00_SPEC_KERNEL.md`, `03_Business_Model.md`, `04_Market_Research.md` and
> `29_Go_To_Market.md`. Every number here traces to those documents.
>
> **Honesty rule for this deck.** Every market figure is a bottom-up model built on named
> assumptions, stated as such on the slide. There are no citations to third-party research, because
> no trustworthy public dataset exists for private off-street parking in India. Anyone who shows you
> one for this category should be asked for the method.

---

## Slide 1: Title

> # ParkSpace
> ### The parking you booked is waiting for you.
> A marketplace for India's empty private parking.
> Kolkata, 2026.

**Speaker notes.** Do not open with the market. Open with the experience: ask the room how long they
spent looking for parking this week. Land the product promise in one sentence before any number.

---

## Slide 2: The problem

> **In one 500 metre stretch of Park Street at 11:00 on a Tuesday, hundreds of private parking bays
> sit empty behind gates, while drivers circle the same street looking for somewhere to stop.**
>
> The empty driveway. The office basement built for peak. The restaurant forecourt before service.
> The shop frontage outside trading hours.
>
> This is not a shortage of parking. It is a failure to allocate parking that already exists.

**Speaker notes.** The reframing from shortage to allocation is the whole pitch. If they accept it,
every later slide follows. Have one photograph of an empty gated driveway and one of a congested
street, taken 40 metres apart on the same morning.

---

## Slide 3: Why it stays broken

> **Nobody can see the supply, price it, or hold it.**
>
> - There is no registry of private off-street parking in any Indian city.
> - Supply sits with thousands of individual owners, not with operators.
> - The current transaction is cash, with no booking, no receipt and no recourse.
> - So the driver cannot know, before leaving home, whether there will be a space.

**Speaker notes.** This slide also answers "why hasn't this been done". The answer is that the supply
cannot be bought or scraped, only recruited door to door, and that is unattractive work. The
unattractiveness is the moat.

---

## Slide 4: The insight

> **Three things became true, and all three are recent.**
>
> 1. **UPI made a Rs 60 payment between strangers normal.** This category was uneconomic before it.
> 2. **Supply must be recruited by people, and therefore compounds.** Every host we sign makes the
>    next competitor's job harder.
> 3. **The hard problem is correctness, not design.** "Your space is held" must be structurally
>    true, not probably true.

**Speaker notes.** Point 3 is where a technical investor leans in. Point 2 is where a marketplace
investor leans in. Do not rush past either.

---

## Slide 5: The product

> **Search. Reserve. Pay. Park.**
>
> - The driver books a **specific bay** for a **specific time range** before leaving home.
> - The host sets her own hours and her own price, and is paid automatically.
> - One inventory model serves an hour, a day, a fortnight or a month.
> - Exact address, gate and access instructions unlock 24 hours before arrival, never before.

**Speaker notes.** Demo live if possible, on a phone, on the real inventory. Show the quote screen
with base, fee, GST and total visible before signup. Show the privacy rule in action: jittered pin,
then exact address after confirmation.

---

## Slide 6: The technical guarantee

> **Double-booking is impossible, not unlikely.**
>
> ```sql
> CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
>   space_id WITH =, bay_index WITH =, period WITH &&
> ) WHERE (status IN ('pending','confirmed','active'))
> ```
>
> Two concurrent reservations on overlapping intervals of the same bay cannot both commit. The loser
> gets a clean error. No locking, no retry loop, no race.
>
> A hold placed at the payment screen participates in the same constraint and expires after 10
> minutes.

**Speaker notes.** This is the slide that separates us from a listings directory. Say it plainly: the
promise is enforced by the database, so it cannot be broken by a bug in application code. It also
explains our deliberate choice of Postgres over the document store the original brief assumed.

---

## Slide 7: Market, built bottom up

> **No citations. Every variable named and challengeable.**
>
> | | GBV per year | Net revenue at 15% take |
> | --- | ---: | ---: |
> | TAM: 12 comparable Indian cities, marketplace-addressable | Rs 3,153 cr | Rs 473 cr |
> | SAM: Kolkata, marketplace-addressable | Rs 239 cr | Rs 36 cr |
> | SOM: six launch neighbourhoods | Rs 50 cr | Rs 7.5 cr |
>
> Built from: 1.3 m four-wheelers x 55% active on a weekday x 18% parking in a paid-relevant
> location x Rs 120 average spend x 300 equivalent days, plus 22,500 monthly bays at Rs 2,500.

**Speaker notes.** Offer the assumption table before they ask for it. Name the weakest variable
yourself: the 45% share of parking spend that occurs at private off-street bays. Then say how it
gets validated, by transect counts on Park Street. Investors trust a founder who attacks their own
model first.

---

## Slide 8: Unit economics

> **One booking of Rs 300.**
>
> | Line | Rs |
> | --- | ---: |
> | Driver pays | 317.70 |
> | Host receives | 270.00 |
> | Platform revenue (10% host commission + 5% driver fee) | **45.00** |
> | Variable cost (gateway, payout, messaging, support, refunds) | (11.75) |
> | **Contribution margin** | **33.25** |
>
> **73.9% contribution margin on net revenue. 11.1% of gross booking value.**
> Payback on a Rs 250 driver acquisition cost: about 8 completed bookings.

**Speaker notes.** Emphasise that the cost stack is assumed and will be replaced with measured data
after 1,000 bookings, and that the fixed components make small bookings unprofitable. That is why
monthly and multi-day inventory, not hourly retail parking, is the strategic product.

---

## Slide 9: The go-to-market, supply first

> **Density beats reach. 150 live spaces inside 2 km before a single rupee of driver acquisition.**
>
> - Supply has a multi-week cycle time. Demand has a one-day cycle time. Start with the slow side.
> - A driver who searches and finds nothing never returns. A host who waits, if told honestly, stays.
> - 650 doors knocked produces 100 hosts and roughly 320 bays.
> - Every listed space becomes an SEO page, a map pin and a search result. Supply is distribution.

**Speaker notes.** Read the actual door-to-door script aloud, from `29_Go_To_Market.md`. It is the
single most persuasive artefact in the deck because it proves the team has thought about the work
rather than the strategy.

---

## Slide 10: The 90-day plan

> | Day | Milestone |
> | --- | --- |
> | 30 | 40 spaces live, 20 completed bookings, measured host yes rate |
> | 60 | **150 spaces live inside 2 km. Density gate passed** |
> | 90 | 250 spaces, 400 activated drivers, 2,000 completed bookings |
>
> **North Star: successfully completed parking hours per week.** Day 90 target: about 7,000.

**Speaker notes.** State the gate as a rule with teeth: if day 60 arrives and the gate is not met, we
do not spend on drivers, we keep knocking. Investors have watched too many marketplaces spend into a
thin supply base.

---

## Slide 11: The 24-month model

> **Illustrative, cohort-based, not a forecast.**
>
> | | Month 12 | Month 24 |
> | --- | ---: | ---: |
> | Monthly bookings | 11,632 | 45,868 |
> | Monthly GBV | Rs 34.9 lakh | Rs 137.6 lakh |
> | Monthly net revenue | Rs 5.2 lakh | Rs 20.6 lakh |
> | Exit run rate | | **Rs 2.48 cr net revenue** |
> | Weekly completed parking hours | | about 37,000 |
>
> Assumptions: linear driver acquisition to 3,250 per month, retention settling at 24%, 4 bookings
> per active driver per month, Rs 300 average booking value held flat.

**Speaker notes.** Say out loud what the model excludes: salaries, field operations and marketing.
Contribution is not profit. Reaching operating break-even needs a second city on the same fixed base
or the layered revenue streams. Hiding that would be discovered in diligence anyway.

---

## Slide 12: Sensitivity

> **Month-24 monthly net revenue, Rs lakh.**
>
> | Repeat rate | 10% take | 15% take | 20% take |
> | --- | ---: | ---: | ---: |
> | 18% | 10.8 | 16.2 | 21.6 |
> | **24%** | 13.8 | **20.6** | 27.5 |
> | 30% | 16.7 | 25.1 | 33.4 |
>
> Retention and take rate move revenue by similar magnitudes. **Retention is the cheaper lever, and
> it does not push hosts off the platform.**

**Speaker notes.** Note that the model cannot see off-platform leakage, which is the real cost of
raising take rate. Every cell is contribution-positive: the risk here is failing to reach density,
not broken unit economics.

---

## Slide 13: Why we win

> 1. **Supply density per neighbourhood.** A competitor must re-recruit the same doors and beat an
>    income the host is already happy with.
> 2. **Trust infrastructure.** Verification, two-sided reviews, audit log, disputes, row-level
>    privacy. A review corpus cannot be bought.
> 3. **The access layer.** The gate, the approach, the guard, the night photograph. Operational
>    knowledge that only exists because someone stood there.
> 4. **Range-based inventory.** One model serves an hour or a month. Retrofitting this into a
>    slot-based system is a rewrite.

**Speaker notes.** Be explicit that only the first is a true moat and the rest compound it. Then
answer the question they are about to ask: a large incumbent adding parking as a feature still has
to knock on the same 650 doors.

---

## Slide 14: The competition, honestly

> | Category | Their strength | The gap |
> | --- | --- | --- |
> | International marketplaces | Proven model, mature trust design | Not here. Indian supply needs field recruitment, not growth marketing |
> | Data aggregators | Enormous coverage | Information is not a reservation, and they own no supply |
> | Smart-parking operators | Real sites, barriers, enforcement | Fixed capacity, at the site rather than the destination |
> | Residential parking software | Verified inventory, one sale unlocks many bays | Internal allocation, not external demand |
> | **The attendant on the street** | **Zero friction, flexible, human, cash** | **No guarantee before arrival, no receipt, no recourse** |
>
> **The real competitor is a habit.** We beat it at its weak end: the trips where uncertainty is
> expensive.

**Speaker notes.** Never disparage the informal market. Describe it accurately and respectfully, then
show which trips it cannot serve: the 06:20 flight, the 20,000-person event, the 08:00 hospital
appointment, the monthly commuter bay.

---

## Slide 15: The ask

> **We are raising Rs 6 crore to prove one city.**
>
> | Use | Share | What it buys |
> | --- | ---: | --- |
> | Field supply operations | 35% | 6 agents, 24 months, 1,500+ spaces across six neighbourhoods |
> | Engineering and product | 30% | 4 people: booking engine, operator tools, monthly and corporate |
> | Driver acquisition | 20% | Post-gate only, capped by measured payback |
> | Support, trust and safety | 10% | Disputes, verification, incident response |
> | Legal, compliance and accounting | 5% | GST position, host agreements, payments compliance |
>
> **Milestones we are underwriting:** 1,500 live spaces in Kolkata, 37,000 completed parking hours a
> week, Rs 2.5 crore net revenue run rate, and a validated, repeatable neighbourhood playbook.

**Speaker notes.** Frame it as buying evidence, not growth: the output of this round is a playbook
that says what a neighbourhood costs to build and what it returns. That is the asset the next round
is priced on.

---

## Risks and mitigations

Stated plainly, because every one of these will surface in diligence and it is better that we raise
them first.

### 1. Regulatory risk

**The risk.** Municipal rules on commercial use of private premises, residential zoning, and
society bye-laws may restrict paid parking on private property. Rules differ by city and are open
to local interpretation. A restrictive reading could make residential supply unviable in some areas.

**Mitigation.** Engage the municipal corporation early and present as a congestion-reduction
partner, because taking cruising traffic off the kerb is genuinely aligned with civic objectives.
Keep host agreements clear that the host warrants their right to offer the space. Diversify supply
across residential, commercial and institutional so no single ruling removes the inventory base.
Build in a city where we can have the conversation in person before scaling to cities where we
cannot.

**Residual risk: medium.** This is the risk most likely to reshape the model, and it cannot be
engineered away.

### 2. Supply churn

**The risk.** A host who lists, earns Rs 400 and delists has cost more to recruit than she will ever
return. Density decays if churn outruns recruitment, and a neighbourhood can hollow out while the
total listing count still looks healthy.

**Mitigation.** Treat 90-day host survival as a first-class metric with a stated floor of 60%.
Guarantee a first booking within 14 days of going live, subsidised if necessary. Make the first
payout early and visible. Give the host complete control over hours and blackout dates so hosting
never becomes an obligation. Weight recruitment towards commercial and society supply, where one
signature holds many bays and the counterparty is institutional rather than personal.

**Residual risk: medium.** Manageable, but only with sustained field effort, which is why supply
operations is the largest line in the use of funds.

### 3. Trust incidents

**The risk.** A vehicle is damaged in a host's driveway. A host's property is damaged by a driver. A
serious safety incident occurs. Any one of these can be a reputational event that outruns the facts,
particularly early, when a single story is the whole public record of the company.

**Mitigation.** Verification of hosts and spaces before listing. Photographic evidence at check-in
and check-out. A complete audit trail of every state transition. A written and rehearsed incident
response plan with a named owner. Resolve fast and generously: the cost of a refund is trivial next
to the cost of an aggrieved user with a phone. Investigate insurance products for host property and
driver vehicle cover as a priority once volume justifies underwriting.

**Residual risk: medium to high early, falling with volume.** The first serious incident will happen
at low volume, when we can least afford it. Preparation is the only mitigation available.

### 4. Payments and tax compliance

**The risk.** The GST treatment of a parking marketplace is unsettled: whether the platform is an
aggregator liable on the full supply value or an intermediary liable only on its fee, the TDS and
TCS position under section 194-O, and the invoicing obligation towards unregistered hosts. A wrong
reading creates a retrospective liability. Payout flows to individual hosts also raise KYC
obligations.

**Mitigation.** This is settled by a chartered accountant before real money moves, not after, per
`20_Legal_Requirements.md`. Every tax decision is isolated in a single module, `lib/pricing/tax.ts`,
so a reclassification is a configuration change rather than a rewrite. All rates live in
`platform_settings` and are changeable at runtime. Payouts run through a regulated provider that
carries the KYC obligation, and money is stored as integer paise so every booking reconciles exactly.

**Residual risk: low on execution, medium on interpretation.** The engineering is prepared. The
interpretation needs professional advice we have not yet bought.

### 5. Incumbent response

**The risk.** A large consumer platform with existing driver relationships, a mapping product or a
ride-hailing network adds parking as a feature and distributes it instantly to millions of users.

**Mitigation.** They would still have to knock on the same 650 doors, and distribution does not
create supply. Our defence is depth in specific neighbourhoods, the operational access layer and
host relationships built in person. In practice the more likely outcome is distribution partnership
rather than direct competition, because supply acquisition is exactly the work large platforms
prefer to buy rather than do. We keep the B2B API on the roadmap so that being a supply layer inside
someone else's app is a business model rather than a defeat.

**Residual risk: low in years 1 to 2, rising thereafter.** The window is the time it takes to make
six Kolkata neighbourhoods genuinely dense, and that is the window this round is buying.

### 6. The risk we consider largest

**Failing to reach density at all.** Every other risk here assumes a working marketplace. The
scenario that actually kills the company is a thin supply base spread across too much geography,
producing a product that works one time in three, with an investor clock running. The density gate
in `29_Go_To_Market.md` exists precisely because the pressure to skip it will peak at the moment
skipping it is most expensive.
