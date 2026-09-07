# 24. Privacy Policy (Draft, User Facing)

> **UNREVIEWED DRAFT. NOT LEGAL ADVICE. DO NOT PUBLISH TO REAL USERS.**
>
> This is an engineering-ready draft prepared for review by qualified Indian counsel. It
> has **not** been settled by an advocate and it has **not** been settled by a chartered
> accountant. It is not an executable legal instrument and it must **not** be published on
> a live site in its current form. Sections marked **REVIEW REQUIRED** are known open
> questions, several of which depend on rules under the Digital Personal Data Protection
> Act 2023 that may not yet be notified. The engineering obligations behind this document
> are in `19_Privacy_Requirements.md`, and where the two differ, that document states what
> the system must actually do and this one must be corrected to match.

---

**Effective date:** `[EFFECTIVE DATE]`
**Version:** `[VERSION]`
**Who we are:** `[COMPANY LEGAL NAME]`, CIN `[CIN]`, registered office `[REGISTERED
ADDRESS]`, trading as ParkSpace. In this policy, "we", "us" and "our" mean
`[COMPANY LEGAL NAME]`, and "you" means the person using ParkSpace as a driver, as a host,
or as both.

---

## 1. In short

ParkSpace is a marketplace that lets people rent out a parking space and lets drivers book
one in advance. To do that we need some information about you. This policy explains what we
collect, why we collect it, who else sees it, how long we keep it, and what you can ask us
to do about it.

Three things worth knowing up front:

1. **We do not sell your personal data.**
2. **We do not track your location.** We take a single location reading when you check in
   to a space and another when you check out, and only if you allow it. Nothing else.
3. **A host's exact address is not public.** Search shows an approximate point, deliberately
   offset. The precise address and the access instructions go only to a driver who has
   actually booked that space, and only from 24 hours before the booking starts. Section 5
   explains this in full.

---

## 2. What we collect and why

| What we collect | Why we collect it | When |
| --- | --- | --- |
| Email address | To create your account, send you a sign-in code, and send booking confirmations and receipts | At sign-up |
| Password | To sign you in. We store a cryptographic hash, never the password itself | At sign-up, if you set one |
| Mobile number | So a host and driver can be reached about a booking, and for booking alerts | At first booking, or during host onboarding |
| Name and profile photo | So the person on the other side of a booking knows who they are dealing with | At sign-up, optional photo |
| Vehicle registration, make, model, colour | So the host can identify your vehicle at the space and so a dispute can be resolved | At first booking |
| Booking details: space, dates, times, amounts, status | To provide the service, to support you, and to keep the accounting records we are required to keep | On each booking |
| Payment reference and a masked version of your instrument | To take payment, issue refunds, and reconcile transactions. We do not store full card numbers | On each payment |
| Host payout details: bank account or UPI identifier | To pay hosts their earnings | During host onboarding |
| Host verification documents: identity, address, and proof of the right to let the space | To confirm the host is real and is entitled to let the space, which protects everyone | During host onboarding |
| Space information: address, coordinates, photographs, access instructions, gate number | To list the space and let a confirmed driver actually reach it and get in | When a host creates a listing |
| A single device location reading at check-in and check-out | To confirm you are at the space at the time you say you are. This is one reading, not tracking | At check-in and check-out, with your permission |
| Messages between host and driver | To let you coordinate, and as evidence if something goes wrong | When you send them |
| Reviews and ratings | To help other users decide | After a completed booking |
| Dispute reports and any evidence you upload | To resolve the dispute fairly | When a dispute is raised |
| Support messages | To answer you | When you contact us |
| IP address, browser and device information, request identifiers | To keep the service secure, to apply rate limits, and to detect fraud | Automatically |
| Cookies and similar identifiers | To keep you signed in, and, if you agree, to measure how the product is used | See section 6 |
| Product analytics events | To understand which parts of the product work and which do not | If you agree |

We collect information at the point it is needed, not all at once. A driver is never asked
for bank details. A person who only searches is never asked for a vehicle.

---

## 3. How we use your information

We use your information to:

1. create and run your account and sign you in;
2. show you spaces, produce a price and hold a space while you pay;
3. take payment, issue refunds, and pay hosts;
4. connect a driver and a host for a confirmed booking, including releasing the address and
   access instructions as described in section 5;
5. record check-in and check-out, calculate any overstay, and complete the booking;
6. handle disputes and damage claims;
7. verify hosts and spaces, and detect and prevent fraud, including fake listings, fake
   bookings and payment fraud;
8. keep the service secure, including rate limiting and abuse detection;
9. send you transactional messages that are part of the service, such as a booking
   confirmation, a reminder, a receipt or a security alert;
10. send you marketing messages, only if you have opted in, and you can opt out at any
    time;
11. measure how the product is used so we can improve it, where you have agreed;
12. keep the financial and business records we are required to keep and to deal with legal
    claims and lawful requests.

We do not use your data to make automated decisions that produce a legal effect on you
without a human being involved. We do run automated checks that may flag an account for
review, for example an unusual pattern of bookings, but a suspension is reviewed by a
person. **REVIEW REQUIRED:** whether this description is accurate for every fraud control
the platform ends up shipping, and what must be disclosed about it.

---

## 4. Who we share it with

**With the other side of a booking.** When a booking is confirmed, the host sees the
driver's display name, the vehicle details and the booking times. The driver sees the
host's display name, the space details, and, from 24 hours before the booking starts, the
exact address, the gate number and the access instructions. Each of you may use that
information only for that booking.

**With service providers who work for us.** They may only use your data to provide their
service to us:

| Provider | What they do | What they get |
| --- | --- | --- |
| Supabase | Database, sign-in and file storage | The data we store |
| Vercel | Hosting and running the application | Requests, IP address, technical logs |
| Razorpay, when enabled | Taking payments and paying hosts | Name, email, mobile, amount, payout details |
| Email provider | Sending transactional and, separately, marketing email | Email address, name, message content |
| SMS or push provider | Booking notifications | Mobile number, message content |
| Analytics and error monitoring | Measuring and diagnosing the product | A pseudonymous identifier, event and error data, IP address |
| OpenStreetMap tile servers | Serving map images to your browser | Your IP address and the map area your browser requests |
| Nominatim and OSRM | Turning an address into coordinates, and directions | Requests made through our servers, so your IP address is not passed on for geocoding |

**With authorities**, where we are required to by law, by a court, or by a lawful request
from a regulator, and where we may lawfully do so.

**In a business transfer**, if we are acquired or reorganised, in which case your data
moves with the business and this policy continues to apply until you are told otherwise.

**We do not sell your personal data, and we do not share it with advertisers for their own
purposes.**

**REVIEW REQUIRED:** the final provider list, the contractual terms with each, and whether
any of them process data outside India. See section 9.

---

## 5. Location privacy: the rule that protects hosts

This is the most important privacy rule in ParkSpace, so it gets its own section.

**Before a booking is confirmed, nobody sees where a space actually is.** When you search,
the map shows a point that is deliberately offset from the real location by between 80 and
150 metres, along with the street and the locality. The house number, the building name and
the bay identifier are not shown. The offset is fixed for each space, so you cannot average
several views to work out the real point.

**After a booking is confirmed, and from 24 hours before it starts**, the driver holding
that booking sees the exact address, the gate number and the access instructions. Nobody
else does.

This is enforced by the database itself, using row-level security rules, not by hiding a
field in the app. The precise location is not sent to your browser at all until you are
entitled to it.

**If you are a host**, this means: your address is not on the public internet because you
listed a space. It is given to a specific driver, at a specific time, for a specific
booking, and every release is logged.

**If you are a driver**, this means: you will not have the address the moment you book a
space weeks in advance, and that is deliberate. You will have it a day before you need it,
in the app, in your booking. You must not share it with anyone other than a person driving
the vehicle on that booking, and you must not record or publish it.

We also strip location metadata from every photograph uploaded to ParkSpace, because a
photo taken on a phone can otherwise carry the exact coordinates of the place it was taken.

---

## 6. Cookies and similar technologies

We use:

1. **Strictly necessary cookies**, to keep you signed in, to keep your session secure, and
   to protect against cross-site request forgery. These cannot be turned off, because
   without them you cannot sign in.
2. **Preference storage**, to remember things like your last search area or your language.
3. **Analytics cookies and identifiers**, only if you agree, to understand how the product
   is used in aggregate.

We do not use advertising cookies and we do not run third-party advertising trackers.

You can manage your choice in **Account, Privacy, Consent settings** at any time, and you
can also clear or block cookies in your browser, though blocking the strictly necessary
ones will break sign-in.

Your browser loads map tiles directly from OpenStreetMap tile servers, which means those
servers see your IP address and the area of the map you are looking at. That is how map
tiles work on the open web, and we mention it because it is not obvious.

**REVIEW REQUIRED:** the form of consent required for analytics cookies and whether a
consent banner is mandatory.

---

## 7. How long we keep it

| What | How long |
| --- | --- |
| Technical logs | 30 days |
| The location reading from a check-in | 90 days as a coordinate, then reduced to a simple "was at the space" or "was not" flag |
| Messages between a host and a driver | 2 years after the booking thread ends |
| Support conversations | 2 years |
| Analytics events | 13 months, then kept only in aggregate |
| Check-in and check-out records | 3 years |
| Disputes and evidence | 3 years after the dispute closes, longer if a claim is still live |
| Host verification documents | Up to 1 year after the host account closes. **REVIEW REQUIRED** against any identity verification obligation we may have |
| Listings, including photographs and the exact address | 1 year after the listing is removed |
| Booking, payment, refund and payout records | `[RETENTION YEARS]` years. **REVIEW REQUIRED:** the exact period required for financial records has not yet been confirmed by our chartered accountant, and we will not publish a number we have not verified |
| Your profile, email, phone and vehicles | Until you close your account, then 90 days |

---

## 8. Security

We take the security of your information seriously. Among other measures:

1. Data is encrypted in transit, and at rest by our infrastructure providers.
2. Access to your data is controlled at the database level by rules tied to your account,
   not by what the app chooses to display.
3. Verification documents and dispute evidence sit in private storage. They have no public
   address, and access is granted only through short-lived links issued after an
   authorisation check, with every issue recorded.
4. Payout details are masked everywhere they are displayed.
5. We keep an append-only audit log of significant actions, including every release of a
   host's exact address to a driver.
6. Our staff can see only what their role requires. Actions on money and on accounts are
   recorded with the person who took them.
7. We run rate limiting, fraud detection and dependency vulnerability scanning.

No system is perfectly secure. If something does go wrong, we have an incident process
that includes assessing who is affected and notifying people where we are required to, or
where we judge it right to. **REVIEW REQUIRED:** the exact notification obligation, its
timing and its recipient are not yet settled, and this section must be updated once counsel
confirms them.

Please help us: use a strong, unique password, do not share your sign-in code with anyone,
and tell us immediately at `[SECURITY EMAIL]` if you think your account has been accessed
by someone else.

---

## 9. Where your data is

We aim to store and process personal data in India wherever our providers offer it. Some
processing, particularly application hosting and technical logs, may happen on
infrastructure outside India.

**REVIEW REQUIRED:** we will not state that all data stays in India until we have confirmed
the actual region of each provider and confirmed the position on payment data with our
payment provider and with counsel. This section will be replaced with a specific statement
before publication. See `19_Privacy_Requirements.md` section 7.1.

---

## 10. Your rights and how to use them

You can:

| Right | How |
| --- | --- |
| **See what we hold about you**, and get a copy in a machine-readable format | Account, Privacy, Download my data. We will ask you to confirm it is you, then prepare the file and email you a secure link |
| **Correct something that is wrong** | Most fields you can edit yourself in Account and in your listings. For anything you cannot edit, such as a verified name, contact support |
| **Delete your account and your data** | Account, Privacy, Delete my account. See section 11 |
| **Take your data elsewhere** | The same export as above, in JSON and CSV |
| **Withdraw consent** | Account, Privacy, Consent settings. Each purpose has its own switch, and turning one off is one action with no interstitial trying to talk you out of it |
| **Opt out of marketing** | The unsubscribe link in any marketing email, or the consent settings. This does not stop booking confirmations and receipts, which are part of the service |
| **Nominate someone** to exercise your rights if you die or become incapacitated | Account, Privacy, Nominee. **REVIEW REQUIRED** on the form and proof required |
| **Complain** | Section 12 |

We will respond to a request within `[RESPONSE DAYS]` days. **REVIEW REQUIRED:** the
statutory response period has not been confirmed, and we will not publish a number we
cannot meet.

We will ask you to prove it is you before we act on a request to export or delete, because
acting on a request from the wrong person is itself a privacy failure.

---

## 11. Deleting your account

When you ask us to delete your account:

1. We stop you being able to sign in, withdraw any listings, cancel any upcoming bookings
   under `23_Refund_Policy.md`, and stop all marketing.
2. We check for anything that blocks deletion: an active or upcoming booking, an open
   dispute, an unpaid amount or an unsettled payout. If one applies, we tell you what it is
   and when it will clear. A block delays deletion, it does not cancel your request.
3. After 90 days, or once the last block clears, we remove your personal information: your
   name becomes "Deleted user", your email, phone, photo and vehicle details are removed,
   and anything you wrote in messages is deleted.
4. **We keep the financial record of your bookings**, meaning the dates, the amounts and
   the space, without your identity attached to it. We do that because we are required to
   keep accounting records and because we may need them to deal with a claim. This is the
   one part of your data that survives a deletion request, and we would rather tell you
   plainly than bury it.
5. Reviews you wrote stay published, detached from your name, because removing them would
   mislead the people who relied on them.
6. We tell our service providers to delete your data too.
7. Our backups are not individually editable. Data in a backup ages out on its own cycle,
   currently 35 days, after which it is gone.

---

## 12. Grievances and complaints

If you are unhappy with how we have handled your personal data, contact our Grievance
Officer:

- **Name:** `[GRIEVANCE OFFICER NAME]`
- **Designation:** `[DESIGNATION]`
- **Email:** `[GRIEVANCE OFFICER EMAIL]`
- **Address:** `[REGISTERED ADDRESS]`

We will acknowledge your complaint within **48 hours** and aim to give you a substantive
response within **30 days**.

If you are still not satisfied, you may complain to the relevant authority under Indian
data protection law. **REVIEW REQUIRED:** the correct authority and the route to it must be
named specifically before this policy is published, and it may depend on rules that are not
yet notified.

---

## 13. Children

ParkSpace is not for anyone under 18. You must be 18 or older to have an account, and a
driver must hold a valid driving licence.

We do not knowingly collect personal data from a child. We do not run behavioural or
targeted advertising at all, and we would not do so towards a child in any event.

If you believe a child has given us personal data, contact `[GRIEVANCE OFFICER EMAIL]` and
we will close the account and delete the data.

**REVIEW REQUIRED:** whether self-declared age plus the driving licence requirement is
sufficient, or whether a verification step is required for children's data obligations
under Indian law.

---

## 14. Changes to this policy

We will update this policy when what we do changes. When a change is material we will tell
you by email and in the app at least 14 days before it takes effect, and we will keep the
previous versions available so you can see what changed. If a change means we want to use
your data for a genuinely new purpose, we will ask you again rather than assume.

---

## 15. Contact

- **General and privacy questions:** `[PRIVACY EMAIL]`
- **Grievance Officer:** `[GRIEVANCE OFFICER NAME]`, `[GRIEVANCE OFFICER EMAIL]`
- **Security issues:** `[SECURITY EMAIL]`
- **Post:** `[COMPANY LEGAL NAME]`, `[REGISTERED ADDRESS]`
- **Company identifiers:** CIN `[CIN]`, GSTIN `[GSTIN]`

---

## 16. Open items before publication

| # | Section | Question |
| --- | --- | --- |
| 1 | 3 | Accuracy of the automated decision-making description against the shipped fraud controls |
| 2 | 4 | Final provider list and the contractual terms with each |
| 3 | 6 | Consent form required for analytics, and whether a banner is mandatory |
| 4 | 7 | Retention period for financial records and for verification documents |
| 5 | 8 | Breach notification obligation, timing and recipient |
| 6 | 9 | Actual data location for every provider, and the payment data position |
| 7 | 10 | Statutory response period for rights requests, and the nominee process |
| 8 | 12 | The correct supervisory authority to name |
| 9 | 13 | Sufficiency of self-declared age |
| 10 | All | Whether Bengali and Hindi versions are required for a Kolkata launch |

Every placeholder in square brackets must be filled, and every open item above closed by
the appropriate professional, before this policy goes live.
