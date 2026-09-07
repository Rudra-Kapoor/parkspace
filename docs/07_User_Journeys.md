# ParkSpace: User Journeys

> Derived from `00_SPEC_KERNEL.md`: booking state machine (section 9), location privacy rule
> (section 10), money model (section 7), cancellation policies (section 8), roles (section 4).
>
> Each journey is a numbered sequence. For every step we record the **emotional state** the user is
> actually in, and the **failure mode**, meaning the specific way this step kills the journey. A
> step with no named failure mode has not been thought about properly.
>
> **Moments of truth** are called out separately. These are the small number of steps where trust is
> either won or permanently lost, and they deserve disproportionate engineering effort.

---

## Journey A: Driver, first booking

Persona: Arindam, first attempt, Camac Street, tomorrow 09:00 to 19:00.

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Arrives from a search engine on `/parking/kolkata/camac-street` | Sceptical. Has seen parking apps before and none worked | Page shows zero spaces, or spaces 3 km away. He leaves and never returns |
| 2 | Sees a map with real pins and a count of available spaces | Cautiously interested | Pins are jittered per the privacy rule and he reads the offset as inaccuracy. We must label it: "exact location shared after booking" |
| 3 | Sets date and time, 09:00 to 19:00 tomorrow | Engaged | The duration picker defaults to 1 hour and he does not notice he is pricing the wrong thing |
| 4 | Filters to covered, near his office | Hopeful | Filters return nothing and there is no fallback suggestion. Empty state must offer the nearest alternatives, never a blank screen |
| 5 | Opens a listing: photos, walking distance, host name, rating, access notes summary | Evaluating | Two photos, both blurry, both taken at night. Listing quality is a supply-ops problem that surfaces here |
| 6 | Sees the quote: base Rs 300, service fee Rs 15, GST Rs 2.70, total Rs 317.70 | Checking for a trick | Fees appear only at the payment step. This is the classic trust killer and it is why the quote is shown before signup |
| 7 | Taps Book. Asked to sign in | Mild friction, still committed | A long signup form. Email OTP plus password only, nothing else, and vehicle details can wait |
| 8 | Signs in with email OTP | Slightly impatient | OTP takes 90 seconds or lands in spam. Every second here costs conversion |
| 9 | Adds vehicle: registration number, make, colour | Compliant, this feels reasonable | Strict registration format validation rejects a legitimate plate. Be permissive, normalise server side |
| 10 | Booking enters `pending`. A 10-minute hold is placed and the bay is locked by the exclusion constraint | Reassured by a visible countdown | No countdown shown. He takes 12 minutes, the hold expires, and the space he was buying vanishes with no explanation |
| 11 | Pays through the gateway | Tense. This is the money moment | Gateway redirect fails on his browser, or he closes the tab mid-payment and the booking is left ambiguous |
| 12 | Booking moves to `confirmed`. Confirmation screen, then email and SMS | **Relief.** This is the emotional peak of the journey | Confirmation is silent or slow. If nothing arrives within 30 seconds he assumes it failed and books elsewhere or calls support |
| 13 | Exact address, gate number and access instructions unlock 24 hours before start | Curious, reads them carefully | Instructions are thin: "Park in the driveway". He will not find the gate. This is where field-collected access data earns its cost |
| 14 | Reminder the evening before and again 60 minutes before | Prepared | No reminder. He forgets the booking exists and rebuilds his old cruising habit |
| 15 | Drives to the space, follows access notes, finds the gate | Nervous. Everything rests on this | The gate looks nothing like the photo, or the guard has not been told. **Highest-risk step in the entire product** |
| 16 | Scans the QR to check in. Booking moves to `active` | Relieved it worked | No network in a basement. Check-in must work offline or fall back to a code the host can confirm |
| 17 | Parks and walks to work | Satisfied, slightly surprised | Walk is 9 minutes, not the 4 shown. Distance must be walking distance, not straight-line |
| 18 | Returns at 19:05, checks out. Booking moves to `completed`. `GRACE_PERIOD_MINUTES` covers the 5 minutes | Normal, unremarkable | Overstay charged at minute 1 with no grace and no warning. Instant trust collapse |
| 19 | Prompted to review the host | Willing | Review prompt arrives three days later when the feeling has gone |
| 20 | Sees a receipt he can submit to his employer | Quietly pleased. Now it is better than cash | No itemised invoice with GST shown separately. For Arindam this is a conversion feature, not admin |

**Moments of truth in Journey A**

- **Step 6, the full price before signup.** Showing fees before we ask who he is signals that we are
  not going to trick him. Everything downstream is cheaper if this step is honest.
- **Step 12, the confirmation.** The moment he believes the space is really his. It must be
  instantaneous, and it must state the guarantee in plain words: "Bay 2 at 14A Camac Street is held
  for you from 09:00 to 19:00 tomorrow."
- **Step 15, arriving and finding the gate.** The entire promise is tested in 90 seconds. If this
  fails once, no amount of product quality recovers him.

---

## Journey B: Driver, repeat booking

Persona: Arindam, third week, moving from ad hoc to monthly.

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Opens the app at 08:05 already knowing what he wants | Habitual, impatient | Home screen shows a generic search instead of his last space. Every extra tap erodes the habit |
| 2 | Sees "Book again: 14A Camac Street, 09:00 to 19:00 today" as the first element | Pleased, recognised | Suggestion offers a space he disliked, because we track frequency but not sentiment |
| 3 | One tap to quote, one tap to pay with a saved method | Efficient | Card or UPI mandate not saved, full payment flow repeated. This is where repeat friction kills frequency |
| 4 | Confirmed in under 15 seconds | Confident | Space unavailable today and the fallback is a blank screen rather than the three nearest alternatives at a comparable price |
| 5 | Prompted: "You have booked this space 11 times. Reserve it every weekday for Rs 5,500 a month?" | Interested. The maths is obvious to him | Prompt appears too early, on booking 2, and reads as a hard sell. Trigger on demonstrated habit, not on session count |
| 6 | Reviews the monthly terms, including that monthly inventory is `non_refundable` per kernel section 8 | Cautious. This is a real commitment | Non-refundable is buried. It must be stated in the largest text on the screen, with the exact date he is committing to |
| 7 | Confirms the monthly booking. The host is asked to accept the recurring commitment | Committed | The host declines after he has paid, and the refund path is unclear. Host pre-commitment must be obtained before the driver is charged |
| 8 | Access instructions are permanent. No more reminders needed | Settled. Parking has left his mind | We keep sending daily reminders. For a monthly user, notifications become noise and he disables them all, including the ones that matter |
| 9 | Monthly renewal 5 days before expiry, with one-tap continue | Passive, will renew if easy | Silent auto-charge with no notice. Legal risk and trust risk together |

**Moments of truth in Journey B**

- **Step 3, the second booking.** The whole business rests on the gap between booking one and
  booking two. It must be three taps at most.
- **Step 5, the monthly upgrade offer.** This converts a transactional user into an annuity. Timing
  it on real behaviour rather than a counter is the difference between helpful and pushy.
- **Step 9, renewal.** A renewal that surprises him is worse than a renewal he declines.

---

## Journey C: Host onboarding to first payout

Persona: Kalpana, recruited at her gate by a field agent.

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Field agent knocks, explains in two sentences, shows a neighbour's earnings | Suspicious, then curious | Agent leads with money instead of safety. Her first concern is who will be at her gate |
| 2 | Agrees to try. Signs up with phone and email OTP on the agent's device, then her own | Tentative | Signup demands documents before she has seen any value. Verification comes after listing, never before |
| 3 | Agent photographs the driveway, the gate, the approach and the entrance at night | Amused, slightly self-conscious | Photos taken only in daylight. Half of all arrivals are after dark and the night photo prevents the most common access failure |
| 4 | Listing wizard: capacity 1 bay, covered, height clearance, vehicle sizes accepted | Following along | Wizard has 14 steps. She abandons at step 6 if the agent leaves |
| 5 | Sets availability: weekdays 09:30 to 18:30, blocked on Sundays | **In control. This is what she actually wanted** | Availability model cannot express "not on Sundays, and not the second week of December". Recurring rules and blackout dates are both required |
| 6 | Sets price. We suggest Rs 40 an hour based on nearby listings | Relieved to be guided | No suggestion, just an empty field. She either underprices badly or overprices and never gets booked |
| 7 | Adds access instructions: "Green gate, second from the corner. Reverse in. Do not block the left side" | Engaged, becomes an expert on her own property | Free text field with no prompts. Structured prompts produce far better instructions than a blank box |
| 8 | Submits for verification. Admin reviews photos and address | Waiting, mild anxiety | Verification takes four days. The window of enthusiasm after a field visit is roughly 48 hours |
| 9 | Listing goes live. Notification: "Your space is live on ParkSpace" | Proud, tells her son | Goes live into a neighbourhood with no drivers yet and nothing happens for three weeks. **This is why supply-first sequencing has a hard density gate and an honest expectation-setting script** |
| 10 | First booking request arrives. Driver name, vehicle, rating, time window | **Nervous excitement.** The defining moment of her host life | Notification does not say who is coming. Her single question is unanswered and she declines out of caution |
| 11 | Accepts. Driver arrives, parks, leaves, checks out | Watching from the window, then relaxing | Driver arrives 40 minutes early with no warning. Early arrival must be surfaced to the host |
| 12 | Booking completes. Earnings show Rs 270 of a Rs 300 booking, with the Rs 30 commission itemised | Satisfied. The deduction is fine because it was explained | Payout shows a net number with no breakdown. She assumes she has been shortchanged and calls the agent |
| 13 | Payout reaches her bank account on the stated schedule | **Trust converted into belief** | Payout is one day late. For a first payout this is fatal. The first payout must clear early, even at a cost |
| 14 | Reviews the driver. Receives her first review | Pleased | Review system is one-sided and she feels evaluated rather than respected |
| 15 | Month one summary: Rs 4,200 earned, 14 bookings, 4.9 rating. Prompt to refer a neighbour | Confident, now an advocate | No summary. Without a visible monthly total she never forms a sense of the income and drifts away |

**Moments of truth in Journey C**

- **Step 9, going live into an empty market.** Never let a host go live into a neighbourhood with no
  demand without telling her honestly when demand is expected.
- **Step 10, the first booking request.** Show her who is coming: name, photo if available, vehicle
  and registration, rating. This single screen decides whether she ever hosts again.
- **Step 13, the first payout.** Money arriving, early, exactly as promised, is the moment a
  sceptical 61-year-old becomes a permanent supplier. Treat the first payout as a marketing cost.

---

## Journey D: Host handling a cancellation

Two directions, and they are not symmetrical.

### D1: Driver cancels

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Driver cancels 3 hours before a `flexible` booking | Host is indifferent, has lost nothing yet | Host is not notified and holds the bay all day, losing another booking |
| 2 | Booking moves to `cancelled`. Full refund of the taxable amount; the service fee is retained per kernel section 8 | Neutral | Policy applied incorrectly, or shown to the host as though she was penalised |
| 3 | The slot is automatically returned to inventory and becomes searchable again | Mildly pleased if it rebooks | Slot stays blocked. Silent revenue loss that neither side can see |
| 4 | Host sees: "Cancelled by driver. Your bay is available again. No effect on your rating" | Reassured | No explanation, so she assumes she did something wrong |

### D2: Host cancels

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Kalpana's daughter is visiting. She needs the bay tomorrow, which is already booked | **Guilty and stressed.** She feels trapped by her own listing | No cancel path visible, so she simply blocks the gate on the day. Far worse for everyone than a clean cancellation |
| 2 | She opens the booking and taps Cancel. The consequences are shown plainly before she confirms: the driver is fully refunded including the service fee, and a reliability penalty applies | Anxious but informed | Consequences shown after confirmation. She feels ambushed and delists |
| 3 | She is offered alternatives first: move the booking to her second bay, or let us find the driver another space nearby and cover the difference | **Relieved. There was a way out** | No alternatives offered. A cancellation that could have been avoided becomes a refund and a lost driver |
| 4 | She confirms. The driver is notified immediately with three concrete alternative spaces and a wallet credit | Host: resolved. Driver: annoyed but handled | Driver finds out on arrival. This is the single worst outcome the platform can produce |
| 5 | The platform absorbs the full cost: refund, service fee, gateway cost, goodwill credit | Host is not charged cash | Charging a homeowner host a cash penalty. It converts one cancellation into a permanent supply loss |
| 6 | Reliability score drops. Second cancellation in 90 days triggers a call from the supply team, not an automated warning | Host takes it seriously because a person called | Automated threatening email. She delists the same day |
| 7 | She blocks the dates properly for the rest of her daughter's visit | Back in control | Blackout dates are hard to find, so the problem recurs next month |

**Moments of truth in Journey D**

- **D2 step 2, showing consequences before confirmation.** Honesty here prevents the far worse
  outcome of a host who blocks the gate silently.
- **D2 step 4, how the driver learns.** Immediate notification with real alternatives is the
  difference between a recoverable annoyance and a permanent loss of both users.
- **D2 step 6, a human call.** Supply is recruited by people and it is retained by people.

---

## Journey E: Admin resolving a dispute

Persona: a `support` user, then an `admin` user. Case: driver claims the bay was occupied on arrival
and he had to park elsewhere. Host claims the driver never came.

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Driver raises a dispute from the booking. Booking moves from `active` to `disputed` | Driver is angry and wants immediate resolution | Dispute is buried in a help centre. He posts publicly instead |
| 2 | Structured intake: category, time of arrival, photographs, free text | Driver feels heard because it is specific | A single free-text box. Unstructured disputes cannot be triaged or measured |
| 3 | Automatic acknowledgement with a stated response time | Slightly calmer | Silence. Anger compounds hourly during a dispute |
| 4 | Support opens the case and sees a single timeline: booking record, state transitions with timestamps, check-in attempts, messages, host acceptance time, driver location at check-in attempt, both photo sets | Support is confident because the evidence is in one place | Evidence scattered across systems. Resolution takes days and is guessed rather than determined |
| 5 | Timeline shows a failed QR scan at 09:04 from within 30 metres of the space, and no host response to a 09:06 message | **This is the moment the facts settle the case** | No check-in attempt logging. Without it, this is one person's word against another's, forever |
| 6 | Host is contacted with a specific question and a 12-hour window | Host is defensive but engaged | Accusatory template message. The host feels prejudged and delists regardless of outcome |
| 7 | Host replies that a relative parked there without telling her | Host is embarrassed, not malicious. **Most disputes are like this** | The system assumes fraud. Policy should assume error first and fraud only on a pattern |
| 8 | Support resolves in the driver's favour: full refund including the service fee, plus a wallet credit for the inconvenience | Driver is placated, sometimes more loyal than before | Partial refund with an explanation of policy. He wanted to be believed, not lectured |
| 9 | `admin` executes the refund. The action is written to the audit log with actor, timestamp, reason and amount | Auditable | Refund issued outside the audit trail. Reconciliation breaks and fraud becomes undetectable |
| 10 | Host receives a clear, non-punitive explanation and a one-line prevention tip. No reliability penalty for a first genuine error | Host stays | Automatic penalty on a first offence. We lose a bay to teach a lesson nobody needed |
| 11 | Booking is closed as `disputed` and resolved. Both parties can still review, and the dispute outcome is attached to the record | Closed | Reviews blocked after a dispute, which hides exactly the signal future users need |
| 12 | Case is tagged by root cause and fed into a weekly dispute-cause report | The organisation learns | Disputes handled one at a time with no aggregation. The same root cause recurs for a year |

**Moments of truth in Journey E**

- **Step 4, the single timeline.** A dispute tool that requires an admin to assemble facts from
  five places will produce slow and arbitrary decisions.
- **Step 8, deciding fast and generously.** The cost of a Rs 300 refund is trivially smaller than
  the cost of an aggrieved driver. Decide in hours, not days.
- **Step 10, protecting the host.** Every dispute has two users. Resolving for the driver while
  destroying the host is a net loss.

---

## Journey F: Monthly parking, corporate

Persona: an office manager at a 60-person firm on Camac Street, buying bays for staff. Uses the
`operator` role on the buying side once multiple locations are involved.

| # | Step | Emotional state | Failure mode |
| --- | --- | --- | --- |
| 1 | Staff complain about parking. She searches for monthly parking near the office | Responsible, mildly irritated that this is her job | We rank only for hourly parking terms. The `/parking/[city]/[area]` pages must address monthly demand explicitly |
| 2 | Lands on an area page showing monthly availability and an indicative monthly price | Interested, needs a number for her budget | Only hourly prices shown. She cannot build a case from an hourly rate |
| 3 | Submits an enquiry: 8 bays, weekdays 09:00 to 19:00, from the 1st of next month | Hopeful | Self-serve checkout only. Nobody buys 8 bays through a consumer flow without speaking to a person |
| 4 | Contacted within a business day with a specific proposal: which spaces, which distances, total monthly cost | Impressed by the speed | Generic reply asking her to search the app herself. She gives up and negotiates with a building instead |
| 5 | Supply team confirms host commitment for all 8 bays before quoting | She never sees this work | Quoting before securing supply. Two bays fall through and the whole account is lost in week one |
| 6 | Reviews terms: monthly inventory is `non_refundable`, with a stated notice period and named substitution rights | Cautious. She needs to defend this internally | Consumer cancellation terms applied to a corporate commitment. Neither side can plan |
| 7 | Needs a GST invoice in the company name, and payment by transfer, not a personal card | **This is a hard requirement, not a preference** | Only card checkout. Without proper invoicing the corporate segment does not exist at all |
| 8 | Assigns bays to 8 named employees with vehicle registrations | Organised | No seat model. She ends up sharing one login and the audit trail is meaningless |
| 9 | Employees receive their own access instructions and QR codes | Staff are quietly delighted | Instructions go to her and she forwards them by email. Every access problem becomes her problem |
| 10 | An employee leaves. She reassigns the bay to a new joiner in two clicks | In control | Reassignment requires cancelling and rebooking. She stops managing it and bays go unused |
| 11 | Monthly consolidated invoice, one payment, per-employee breakdown | Finance is satisfied | Eight separate invoices. Finance rejects the arrangement |
| 12 | Renewal 10 days before expiry, with a usage report showing which bays were actually used | Informed. Can justify the spend or trim it | Silent renewal. When finance reviews it, the whole contract is cancelled at once |

**Moments of truth in Journey F**

- **Step 5, securing supply before quoting.** A corporate account lost in week one because two bays
  evaporated is lost permanently, and it takes the reference with it.
- **Step 7, the GST invoice.** Corporate parking is an accounting transaction before it is a
  parking transaction.
- **Step 12, the usage report.** It is the renewal argument. Without it, every renewal is a fresh
  negotiation against a finance team looking for savings.

---

## The five moments that matter most, across all journeys

If engineering and operations effort had to be concentrated in five places, these are they.

1. **The first arrival at a space.** Journey A step 15. Everything the platform promises is settled
   in 90 seconds at a gate.
2. **The host's first payout.** Journey C step 13. This converts a curious homeowner into supply.
3. **The confirmation screen.** Journey A step 12. The instant the guarantee becomes real.
4. **How the driver learns about a host cancellation.** Journey D2 step 4. The difference between an
   annoyance and a permanent loss of two users at once.
5. **Dispute resolution speed.** Journey E step 8. Hours, not days, and decided from a single
   timeline of facts.
