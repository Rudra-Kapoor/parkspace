# ParkSpace: Startup Vision

> Derived from `00_SPEC_KERNEL.md`. Where this document and the kernel disagree, the kernel wins.

## 1. Mission

Make a guaranteed parking space as easy to reserve as a table at a restaurant, and turn every
unused driveway, office bay and shuttered shop forecourt in an Indian city into income for the
person who owns it.

## 2. The problem, stated concretely

Parking in an Indian city is not a shortage problem. It is an allocation problem.

Consider one 500 metre stretch of Park Street in Kolkata on a Tuesday at 11:00. On that stretch
there are, plausibly, several hundred off-street bays: the basement of an office building that is
sized for peak occupancy and is never at peak, the driveway of a house whose owner left for work
at 09:30 and will not return until 19:00, the forecourt of a restaurant that does not open until
18:30, the loading bay of a shop that takes one delivery a day at 07:00, the visitor bays of an
apartment block that see four visitors a week. Every one of those bays is empty at 11:00 and every
one of them is invisible.

Meanwhile a driver circles. He is not looking for a space that does not exist. He is looking for a
space he cannot see, cannot verify, cannot price and cannot hold. So he does what everyone does: he
drives slowly, blocks a lane, negotiates with an attendant, pays cash for an arrangement with no
receipt and no guarantee, or double parks and accepts the risk.

The costs of that mismatch land on four parties at once.

| Party | Cost today |
| --- | --- |
| Driver | Time lost cruising, fuel burned, stress, no certainty of arrival time, cash with no receipt |
| Space owner | An asset generating zero income for 8 to 20 hours a day |
| City | Congestion produced by cruising traffic, kerbside occupied by parked cars, emissions |
| Business | Customers who do not come because they cannot park, staff who arrive late |

The demand and the supply are already in the same 500 metres. There is no coordination layer
between them. That layer is the company.

## 3. The insight

Three things had to become true before this business was buildable in India, and all three now are.

**First, supply is discoverable through people, not through data.** There is no registry of private
parking capacity in any Indian city and there never will be. Supply has to be recruited door to
door, street by street, and then it compounds, because a host who earns Rs 4,000 in a month tells
three neighbours. This is slow to start and very hard to copy once it exists. Nobody wins this with
a crawler.

**Second, payment friction has collapsed.** UPI made a Rs 60 transaction between two strangers
normal. A cashless parking marketplace was not possible when the smallest sensible digital payment
was Rs 500.

**Third, the hard part of the product is a correctness problem, not a UI problem.** The promise is
"a space is held for you". If that promise breaks even twice, the driver goes back to cruising
forever. The kernel makes double-booking structurally impossible using a Postgres range type and a
GiST exclusion constraint rather than application-level locking. That is the difference between a
listings directory and a reservation system, and it is why the technology choice matters.

The insight in one line: **the scarce asset is not parking, it is a trustworthy reservation over a
private bay, and the moat is supply density inside a single neighbourhood.**

## 4. The vision on three horizons

### Year 1: the neighbourhood marketplace

Kolkata only. Park Street, Esplanade, Camac Street, Salt Lake Sector V, Ballygunge and New Town, in
that order. We do not open a second city until the first one has real density, because a marketplace
that is 20% covered everywhere is worth less than one that is 90% covered in six neighbourhoods.

The year 1 product is the MVP boundary in the kernel: search, map, quote, hold, pay, QR check-in,
check-out, cancellation, refund, two-sided review, dispute, payout. Success is measured only in
successfully completed parking hours per week.

### Year 3: the parking operating system for a city

By year 3 ParkSpace should be the default answer to "where do I park" in four to six Indian metros,
and the supply side should have moved from individuals to institutions: office basements sold as
recurring monthly inventory, malls selling their off-peak hours, hospitals selling visitor bays,
apartment societies selling their under-used visitor allocation as managed inventory with staff
seats and gate control through the `operator` role.

The product widens in the ways the kernel deliberately excluded from the MVP: dynamic pricing that
is actually learned rather than hand-tuned, gate and boom-barrier integration, occupancy signal,
corporate billing for monthly parking, and an EV charging layer sold as a commission on kilowatt
hours rather than on hours.

### Year 10: parking infrastructure platform

The end state is not a consumer app. It is the layer that other things route through.

A navigation app should be able to ask ParkSpace for a bay near a destination and get a held
reservation back over an API. A hospital appointment system should be able to attach parking to the
appointment. An event ticket should carry a bay. A fleet operator should be able to place a hundred
vehicles overnight across a city without a single phone call. A municipality should be able to see,
for the first time, a real occupancy map of private off-street capacity and price its own kerbside
against it.

At that point the company is not selling parking. It is selling the guarantee, the access layer and
the settlement rail that make a parking space a bookable, priceable, auditable unit of
infrastructure. That is what "parking infrastructure platform" means and it is the only ending
worth building towards.

## 5. What we explicitly refuse to build

A vision is defined as much by its exclusions. These are commitments, not preferences.

1. **We will not build our own parking lots.** The moment we own concrete we stop being a
   marketplace and start being a real estate business with a marketplace's cost structure.
2. **We will not run valet.** Valet means taking custody of a customer's vehicle. That is an
   operational and liability business, not a software business.
3. **We will not sell driver location data or movement history to advertisers, insurers or
   anybody else.** The location privacy rule in kernel section 10 exists because trust is the
   product.
4. **We will not launch a city we cannot make dense.** No national listing-count vanity number.
5. **We will not take the driver's money without a hard reservation behind it.** No "probably
   available" inventory, no overbooking buffer, ever.
6. **We will not build native mobile apps before the web product is proven.** Kernel section 11
   puts them out of scope for a reason.
7. **We will not become a payments company.** Payments sit behind a provider abstraction with a
   mock and a Razorpay adapter, and they stay there.
8. **We will not hide the price.** The driver sees base, fee, tax and total before paying, every
   time.

## 6. Founding principles

**Guaranteed means guaranteed.** A confirmed booking is a hard reservation enforced in the database.
When we cannot honour it, we say so immediately, refund immediately and pay the reliability penalty.

**Density over reach.** One neighbourhood at 90% coverage beats ten at 20%. Every growth decision is
tested against supply density inside a 2 km radius.

**The host is a partner, not inventory.** Hosts set their own price and their own availability. We
take 10% because we brought the demand and carried the risk, not because we control the asset.

**Money is integer paise.** No floats, no rounding drift, no unexplained rupee. Every booking
reconciles to the paise.

**Trust is infrastructure.** Verification, two-sided reviews, an audit log, dispute resolution and
row-level privacy enforcement are not features to add later. They are the reason a stranger parks in
another stranger's driveway.

**Measure one thing.** Successfully completed parking hours per week. A booking that was made and
not honoured is worth less than no booking at all, and the metric is built so that it says so.

**Say the uncomfortable thing early.** Tax treatment, regulatory exposure, supply churn and trust
incidents are written down in these documents before they are problems, not after.
