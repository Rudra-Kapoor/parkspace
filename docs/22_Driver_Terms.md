# 22. Driver Terms (Draft Driver Agreement)

> **UNREVIEWED DRAFT. NOT LEGAL ADVICE. DO NOT PUBLISH TO REAL USERS.**
>
> This is an engineering-ready draft prepared for review by qualified Indian counsel. It
> has **not** been settled by an advocate and it has **not** been settled by a chartered
> accountant. It is not an executable legal instrument, it binds nobody, and it must
> **not** be presented to a real driver in its current form. Clauses marked **REVIEW
> REQUIRED** are known open questions where a real legal or tax determination is needed.
> Related open items sit in `20_Legal_Requirements.md` section 14.

Derived from `00_SPEC_KERNEL.md`. Defined terms: **Platform** means the ParkSpace website
and application operated by `[COMPANY LEGAL NAME]`, CIN `[CIN]`, registered at
`[REGISTERED ADDRESS]`. **Driver** means you. **Host** means the person who lists a
Space. **Space** means the parking space. **Booking** means a confirmed reservation of a
Space for a stated period.

---

## 1. Agreement and acceptance

1.1 This Agreement governs your use of the Platform as a Driver. It applies in addition to
the general Terms of Service, the Refund Policy at `23_Refund_Policy.md` and the Privacy
Policy at `24_Privacy_Policy.md`.

1.2 You accept it by creating an account, making a Booking, or checking in to a Space,
whichever happens first.

1.3 We may amend this Agreement on 14 days' notice by email and in the Platform. Continued
use after the effective date is acceptance. A change does not affect a Booking already
confirmed. **REVIEW REQUIRED:** enforceability of a unilateral amendment clause against a
consumer in India.

---

## 2. Account and eligibility

2.1 You must be at least 18 years of age.

2.2 You must hold a valid driving licence for the vehicle you park, or the vehicle must be
driven by someone who does.

2.3 You must give accurate account information and keep it current, including a working
email address and mobile number.

2.4 Your account is personal to you. You must not share your login, and you are
responsible for activity under your account unless you tell us promptly that it has been
compromised.

2.5 You must not create multiple accounts to evade a suspension, to obtain repeated
promotional credit, or to manipulate reviews.

2.6 One account may hold both the Driver and the Host role. Holding both does not merge
the two agreements: each applies to the relevant activity.

2.7 We may refuse, suspend or close an account where verification fails, where you have
previously been removed from the Platform, or where we reasonably suspect fraud.

---

## 3. Vehicle accuracy warranty

3.1 You warrant that the vehicle details you enter are accurate and current, including the
registration number, make, model, colour and size class.

3.2 You warrant that the vehicle you park is the vehicle recorded on the Booking. If you
need to change it, change it in the Platform before arrival where possible, and in any
case before check-in.

3.3 You warrant that the vehicle is roadworthy, legally registered, and covered by valid
motor insurance and any other document the law requires.

3.4 You warrant that the vehicle fits within the dimensions stated in the listing. The
Host is not obliged to accommodate a vehicle larger than the Space, and a Booking that
fails because your vehicle does not fit is treated as a no-show under clause 6.5 unless
the listing was inaccurate.

3.5 You must not park a vehicle that is leaking fuel or fluids, that is unregistered, that
is subject to a seizure order, or that carries hazardous goods.

3.6 An inaccurate registration number is a common cause of a dispute at check-in, because
the Host cannot identify the vehicle. Accuracy here is your obligation, not the Host's
problem.

---

## 4. Booking and payment

4.1 When you select a Space and a period, the Platform issues a quote and places a hold on
that bay for up to 10 minutes (`BOOKING_HOLD_MINUTES` default 10) while you pay. If you do
not complete payment in that window the hold expires and the Space becomes available to
others.

4.2 A Booking is confirmed only when payment is successfully verified by our payment
provider. A confirmation screen shown before that verification is not a confirmation.

4.3 On confirmation the Space is reserved for you for the booked period. The Platform
guarantees at the database level that the same bay cannot be sold to two Drivers for
overlapping periods.

4.4 The price you pay is shown in full before you commit and comprises: the amount set by
the Host, plus a **Platform service fee of 5 percent** of that amount
(`DRIVER_SERVICE_FEE_PCT` default 0.05), plus any tax applicable on that fee.

4.5 Worked example on a Rs 500 booking: Rs 500 base, service fee Rs 25, tax on the fee
Rs 4.50, total Rs 529.50.

4.6 The service fee is our charge for providing the Platform. It is retained if you
cancel, and refunded in full if the Host cancels or if we cancel. See
`23_Refund_Policy.md`.

4.7 The minimum booking is 30 minutes (`MIN_BOOKING_MINUTES`) and the maximum is 90 days
(`MAX_BOOKING_DAYS`).

4.8 All amounts are in Indian rupees.

4.9 Payment is processed by an authorised payment aggregator. We do not store your full
card details. Refunds return to the original payment instrument and cannot be redirected
to another account.

4.10 Wallet credit, coupons and referral credit, where offered, are a discount mechanism.
They are not money, are not withdrawable, are not transferable, and may expire. **REVIEW
REQUIRED:** see `20_Legal_Requirements.md` section 4.2 on whether the wallet as designed
is permissible in this form.

4.11 **REVIEW REQUIRED:** the tax treatment of the service fee and of the underlying
parking supply, and what invoice or receipt you are entitled to, are open questions in
`20_Legal_Requirements.md` section 5. The receipt shown in the Platform is provisional
until those are settled.

---

## 5. Grace period and overstay

5.1 Your Booking runs from the start time to the end time you selected. You may arrive at
any point after the start time, but the Space is not held for you beyond the end time.

5.2 A **grace period of 10 minutes** (`GRACE_PERIOD_MINUTES` default 10) applies after the
end time. If you check out within the grace period, no overstay charge applies.

5.3 If you remain beyond the grace period, an overstay charge applies from the original
end time, calculated at the Space's applicable rate with an overstay multiplier set in
`platform_settings` and disclosed to you before you book and again in the Platform when
your Booking is close to ending.

5.4 We will attempt to charge the overstay amount to your payment instrument. If we cannot,
the amount is a debt owed by you, further Bookings may be blocked until it is settled, and
we may set it off against any credit on your account.

5.5 Overstaying is not a way to extend a Booking. If the Space is available, extend the
Booking in the Platform before the end time. If the next period is already booked by
someone else, it cannot be extended and you must leave.

5.6 An overstay that prevents the next Driver from using the Space is a serious breach. In
addition to the overstay charge you may be liable to that Driver and to the Host, and your
account may be suspended.

5.7 The Host must not levy a separate overstay charge of their own. All overstay charges
run through the Platform.

5.8 **REVIEW REQUIRED:** whether the overstay multiplier as configured is a genuine
pre-estimate of loss rather than an unenforceable penalty, and whether the disclosure at
booking is sufficient. Counsel must set the multiplier.

---

## 6. Check-in, check-out and non-arrival

6.1 You must check in through the Platform when you arrive, using the QR code or check-in
control on your Booking. Check-in records the time and, with your permission, a single
location reading from your device.

6.2 The location reading is used only to confirm you are at the Space. It is a single
sample. The Platform does not track your location at any other time. See
`24_Privacy_Policy.md`.

6.3 If your device cannot obtain a location, for example in a basement, you may still
check in and the Host can confirm your arrival. A failed location reading does not by
itself deny you the Space.

6.4 You must not falsify a location reading, use a mock-location tool, or have another
person check in on your behalf while you are elsewhere. Doing so is fraud and will result
in suspension.

6.5 You must check out through the Platform when you leave. Failing to check out may cause
an overstay charge to accrue against you and may block the Host from releting the Space.

6.6 If you do not arrive at all, the Booking is marked as a no-show. The cancellation
policy applicable to the Space determines what, if anything, is refunded. See
`23_Refund_Policy.md` section 5.

6.7 If you arrive and the Space is not available, or you cannot get access, do not simply
leave. Report it in the Platform immediately, with a photograph where it is safe to take
one. Reporting from the location is what allows us to resolve it in your favour. See
`23_Refund_Policy.md` sections 6 and 7.

---

## 7. Conduct and Host rules

7.1 You must follow the Host's reasonable rules for the Space as stated in the listing and
in the access instructions.

7.2 You must park only in the bay allocated to you, must not block any other bay, access
way, gate, fire route or hydrant, and must not obstruct any neighbour.

7.3 You must not use the Space for anything other than parking the vehicle on the Booking.
No storage, no repair work, no washing, no commercial activity, no living in the vehicle.

7.4 You must not admit any other person or vehicle to the Space, and must not sublet,
transfer or resell your Booking.

7.5 You must keep noise down, especially at a residential Space and at night, and must
leave the Space clean.

7.6 You must not share the Host's exact address, gate code or access instructions with
anyone other than a person driving the vehicle on that Booking. Those details are released
to you for the purposes of the Booking only, and you must not record, publish or reuse
them.

7.7 You must treat the Host and anyone at the property respectfully, and must not
discriminate on any protected ground.

7.8 You must comply with all applicable law while at the Space.

7.9 If a Host asks you to leave because of a breach of this clause 7, you must leave. Where
the breach is yours, no refund is due.

---

## 8. Damage to the Space

8.1 You are responsible for any damage you cause to the Space or to the Host's property,
including damage caused by anyone driving the vehicle on your Booking.

8.2 You must report any damage you cause immediately in the Platform.

8.3 A Host may claim for damage through the dispute process in `23_Refund_Policy.md`
section 8. You will be given the evidence and an opportunity to respond.

8.4 We are not a party to a damage claim and do not adjudicate liability in law. What we
do is provide a structured process, share the Booking record, and where appropriate
facilitate a payment. A Host may pursue a claim against you independently of the Platform.

8.5 Where we reasonably conclude that you caused damage, we may charge the agreed amount
to your payment instrument, suspend your account until it is settled, or both. You will be
notified before any charge.

8.6 **REVIEW REQUIRED:** whether charging a damage amount to a Driver's stored instrument
on the basis of a Platform determination is permissible, and what process is required
before doing so.

---

## 9. Prohibited uses of the Platform

9.1 You must not:

(a) make a Booking with no intention of using it, including to block a Host's inventory or
to harm a competitor;

(b) create fake Bookings or reviews, or coordinate with a Host to manufacture completed
Bookings, ratings, referral credit or incentives;

(c) use a payment instrument you are not authorised to use;

(d) cancel and rebook repeatedly to exploit a pricing or promotional mechanism;

(e) contact a Host to arrange the same parking off-Platform in order to avoid the service
fee, after finding the Space through the Platform;

(f) scrape, crawl, index, or systematically extract listings, or attempt to derive exact
addresses from approximate coordinates;

(g) probe, scan or test the security of the Platform, or attempt to bypass any access
control;

(h) harass, threaten, defame or stalk a Host, or use information obtained through a
Booking for any purpose other than that Booking;

(i) upload anything unlawful, or any content you do not have the right to upload;

(j) misrepresent yourself, your vehicle, or the circumstances of a dispute.

9.2 Breach of this clause 9 may result in cancellation of Bookings without refund,
suspension, permanent removal, and reporting to the authorities where the conduct is
criminal.

---

## 10. Our role: a venue, not a parking operator

10.1 We provide a technology platform on which you and a Host find each other, agree a
Booking, and settle payment. **We are not a parking operator.**

10.2 We do not own, control, manage, secure, patrol, inspect, light, clean or maintain any
Space.

10.3 We do not take custody, possession or control of your vehicle at any time. We are not
a bailee. No bailment arises between you and us.

10.4 The contract for parking your vehicle is between you and the Host. Your rights in
respect of the Space itself are against the Host.

10.5 Listing content, including photographs, descriptions and access instructions, is
provided by Hosts. We apply verification and moderation as a trust measure. That is not a
guarantee that a Space is safe, secure, lawful, suitable or as described.

10.6 Reviews reflect the opinions of the users who wrote them.

10.7 **REVIEW REQUIRED:** whether this characterisation holds in law, particularly whether
any bailment or occupier's liability arises, and whether Platform features contradict it
in substance. See `20_Legal_Requirements.md` section 3.

---

## 11. Insurance

11.1 **We do not provide insurance of any kind.** There is no Platform cover for theft of
or damage to your vehicle, for its contents, or for injury to any person.

11.2 Your own motor insurance is your responsibility. You should confirm with your insurer
whether your policy responds to theft or damage while parked on private property booked
through a marketplace. It may not.

11.3 Do not leave valuables in the vehicle.

11.4 If we ever offer an insurance-backed product it will be set out in a separate
document naming the insurer, the limits and the exclusions. Until then nothing said by us
or by any of our staff is a promise of cover, and you should not rely on one.

---

## 12. Liability

12.1 Nothing in this Agreement excludes or limits liability for death or personal injury
caused by negligence, for fraud or fraudulent misrepresentation, or for any liability that
cannot lawfully be excluded. Nothing in this Agreement affects your rights under
applicable consumer protection law.

12.2 Subject to clause 12.1, we are not liable for: theft of or damage to your vehicle or
its contents; the condition, safety, security, legality or suitability of any Space; the
conduct of any Host or any third party; injury occurring at a Space; a Host's failure to
make a Space available, beyond the refund remedies in `23_Refund_Policy.md`; or towing,
clamping or any action taken by a property owner, society or authority in respect of your
vehicle.

12.3 Subject to clause 12.1, we are not liable for indirect or consequential loss, loss of
profit, wasted time, alternative parking cost beyond any amount expressly provided in
`23_Refund_Policy.md`, missed appointments, or loss of data.

12.4 Subject to clause 12.1, our total aggregate liability to you arising out of or in
connection with this Agreement is limited to the total amount you paid for the Booking
giving rise to the claim, or Rs 5,000, whichever is greater.

12.5 The Platform is provided on an "as is" and "as available" basis. We do not warrant
uninterrupted or error-free operation.

12.6 **REVIEW REQUIRED:** whether clauses 12.2, 12.3 and 12.4 are enforceable against a
consumer under Indian law, and what the cap should be. Counsel must set it before
publication.

---

## 13. Reviews

13.1 You may review a Space after a completed Booking. Reviews must be honest, based on
your own experience, and must not contain personal data, the Host's exact address, access
details, abuse or unlawful content.

13.2 We may remove a review that breaches clause 13.1, but we do not remove a review simply
because a Host dislikes it.

13.3 You must not offer, accept or solicit anything in exchange for a review.

13.4 Reviews are published alongside the reviewer's display name and remain published if
you close your account, detached from your identity. See `19_Privacy_Requirements.md`
section 8.3.

---

## 14. Suspension and termination

14.1 You may close your account at any time, provided you have no active or upcoming
Booking, no open dispute and no unpaid amount.

14.2 We may suspend or terminate your account immediately where: we reasonably suspect
fraud, including a falsified check-in or a stolen payment instrument; you materially breach
this Agreement; there is a risk to the safety of any person; a payment is reversed or
charged back; or we are required to act by law or by a regulator.

14.3 We will normally tell you why and give you an opportunity to respond, unless doing so
would prejudice an investigation, breach a legal obligation, or create a risk to another
person.

14.4 On termination, upcoming Bookings are cancelled. Whether you are refunded depends on
the reason: if we terminate for your breach, the cancellation is treated as a Driver
cancellation under the applicable policy; otherwise you are refunded in full.

14.5 Clauses 8, 10, 11, 12, 13.4, 15 and 16 survive termination.

---

## 15. Disputes

15.1 For a dispute about a Booking, use the in-Platform dispute process first. It is faster
than any other route and it is where the evidence lives. See `23_Refund_Policy.md`
section 8.

15.2 For anything else, contact support, then the Grievance Officer,
`[GRIEVANCE OFFICER NAME]`, at `[GRIEVANCE OFFICER EMAIL]`. We acknowledge within 48 hours
and aim to respond substantively within 30 days.

15.3 If the matter remains unresolved, the parties will attempt in good faith to resolve it
by discussion for a further 30 days.

15.4 Thereafter the dispute may be referred to arbitration by a sole arbitrator under the
Arbitration and Conciliation Act 1996, seated at Kolkata, West Bengal, in English.

15.5 **REVIEW REQUIRED:** an arbitration clause in a standard-form consumer contract may
not be enforceable in India and may not oust the jurisdiction of consumer forums. Counsel
must decide whether clause 15.4 appears at all and must confirm that your right to
approach a consumer forum is preserved. Do not publish clause 15.4 without that decision.

15.6 Nothing in this clause prevents either party from seeking urgent interim relief from a
court.

---

## 16. General

16.1 **Governing law.** The laws of India.

16.2 **Jurisdiction.** Subject to clause 15, the courts at Kolkata, West Bengal. **REVIEW
REQUIRED** on whether exclusive jurisdiction binds a consumer resident elsewhere.

16.3 **Assignment.** You may not assign this Agreement. We may assign it to a group company
or on a sale of the business, on notice.

16.4 **Notices.** By email to your registered address and in-Platform. You give notice to
`[LEGAL NOTICES EMAIL]`.

16.5 **Severability.** An unenforceable provision is read down or severed, and the rest
continues.

16.6 **Waiver.** Not enforcing a provision is not a waiver of it.

16.7 **Entire agreement.** This Agreement, the general Terms of Service, the Refund Policy
and the Privacy Policy.

16.8 **Language.** English. **REVIEW REQUIRED** on whether Bengali and Hindi versions are
required for a Kolkata launch, and which prevails.

16.9 **Version.** Version `[VERSION]`, effective `[EFFECTIVE DATE]`. Each version you
accept is recorded against your account.

---

## 17. Open items before publication

| # | Clause | Question | Professional |
| --- | --- | --- | --- |
| 1 | 1.3 | Unilateral amendment against a consumer | Advocate |
| 2 | 4.10 | Whether the wallet is a prepaid payment instrument | Advocate, payment aggregator |
| 3 | 4.11 | Tax on the service fee and the invoice the Driver is entitled to | Chartered accountant |
| 4 | 5.8 | Overstay multiplier: genuine pre-estimate or unenforceable penalty | Advocate |
| 5 | 8.6 | Charging a damage amount to a stored instrument, and the process required | Advocate |
| 6 | 10.7 | Whether bailment or occupier's liability arises despite clause 10 | Advocate |
| 7 | 12.6 | Enforceability and quantum of the liability cap against a consumer | Advocate |
| 8 | 15.5, 16.2 | Arbitration and exclusive jurisdiction against a consumer | Advocate |
| 9 | 16.8 | Language requirements for a Kolkata launch | Advocate |
