# 20. Legal Requirements

> **UNREVIEWED DRAFT. NOT LEGAL ADVICE. DO NOT PUBLISH OR RELY ON.**
>
> This document is an engineering-ready draft prepared for review by qualified Indian
> counsel. It has **not** been settled by an advocate and it has **not** been settled by
> a chartered accountant. It must **not** be published to real users, relied upon in any
> filing, or treated as a compliance opinion in its current form. Sections marked
> **REVIEW REQUIRED** are known open questions, not oversights: they are points where a
> real legal or tax determination is needed and where inventing an answer would be worse
> than leaving the gap visible. Nothing in this document creates a legal obligation on
> `[COMPANY LEGAL NAME]` or on any user.

Derived from `00_SPEC_KERNEL.md`. First market: Kolkata, West Bengal, India.

---

## 1. How to use this document

This is the compliance checklist a founder actually needs before ParkSpace handles real
money from real users. It is organised as: decide the entity, decide what the platform
legally *is*, then work outward to money, tax, insurance, property, consumer law and
brand. Section 14 collects every open question into one table with the professional who
must answer it.

The single most useful thing this document does is section 3. Almost every downstream
obligation, the GST position, the TDS position, the liability position, the insurance
position and the terms of service architecture, follows from whether ParkSpace is a pure
intermediary or something more. Answer that first.

---

## 2. Entity formation

### 2.1 The options

| Structure | What it is | Advantages | Disadvantages |
| --- | --- | --- | --- |
| Sole proprietorship | The founder trading personally | Fastest and cheapest to start, minimal compliance | Unlimited personal liability, which is unacceptable for a business that puts strangers' vehicles on strangers' property. Cannot take institutional investment. Weak counterparty credibility with a payment aggregator |
| Partnership firm | Two or more partners under a deed | Simple, low cost | Unlimited liability for partners. Not investable |
| Limited Liability Partnership | Body corporate with limited liability | Limited liability, lighter compliance than a company, no minimum capital | Equity investors generally will not invest in an LLP. Employee stock options are impractical. Converting later is possible but costly and taxable in some scenarios |
| **Private limited company** | Company under the Companies Act 2013 | Limited liability, the structure investors expect, share capital, ESOP possible, strongest credibility with payment aggregators and with hosts | Higher compliance burden: statutory audit, board meetings, annual filings, director obligations, secretarial cost |
| One Person Company | Single-member company | Limited liability with one founder | Conversion thresholds, cannot have more than one member, generally a waypoint rather than a destination |

### 2.2 The working recommendation, subject to review

A **private limited company** is the structure that matches the risk profile and the
likely funding path. A two-sided marketplace that mediates physical access to private
property carries tail risk (damage, trespass, injury, a dispute with a housing society)
that no founder should hold personally, and a payment aggregator will ask for a
corporate entity, a bank account in the entity's name and identity documentation for
directors and beneficial owners.

**REVIEW REQUIRED:** the choice of entity has tax, foreign investment and cost
consequences that depend on the founders' circumstances, the expected funding route and
whether any founder is not resident in India. A chartered accountant and a company
secretary must confirm the structure, the authorised and paid-up capital, the
shareholding and the director set before incorporation.

### 2.3 Post-incorporation items

1. Certificate of Incorporation, CIN recorded as `[CIN]`.
2. PAN and TAN for the entity.
3. Current account in the entity's legal name. The payment aggregator will settle only
   to an account matching the entity.
4. Registered office at `[REGISTERED ADDRESS]`, with the statutory name and address
   display and the entity name on letterhead, invoices and the website footer.
5. Professional tax registration in West Bengal, and Shops and Establishments
   registration for the office. **REVIEW REQUIRED** on applicability and on the Kolkata
   municipal procedure.
6. Employee provident fund and employee state insurance registration once headcount
   thresholds are crossed. **REVIEW REQUIRED** on the thresholds and timing.
7. Statutory auditor appointed within the prescribed period after incorporation.
8. Board resolutions authorising the bank account, the payment aggregator relationship
   and the appointment of the grievance officer.

---

## 3. The question that determines everything: intermediary or aggregator

### 3.1 Why this is the first question

If ParkSpace is a **pure intermediary**, it provides a technology platform on which
independent hosts and independent drivers contract with each other. The parking service
is supplied by the host to the driver. ParkSpace supplies only a matchmaking and payment
facilitation service, and charges a commission to the host and a service fee to the
driver for that service. On that footing:

- ParkSpace's revenue is the commission plus the service fee, not the full booking value.
- ParkSpace's own tax output is on its commission and fee, not on the parking.
- The host's supply is the host's own tax problem, subject to the host's own thresholds.
- ParkSpace's liability for the parking itself is limited, because it does not supply it.
- The safe-harbour available to intermediaries under Indian information technology law
  may be available, conditional on compliance with the applicable due diligence rules.

If ParkSpace is instead treated as **the supplier of the parking service**, for example
because it controls price, controls the terms, holds itself out as providing parking, or
is deemed to be an electronic commerce operator on whom the tax liability is cast, then:

- The full booking value may be ParkSpace's turnover, not just the commission.
- ParkSpace may be liable to charge and remit tax on the whole supply, including supplies
  by hosts who are themselves below any registration threshold.
- ParkSpace's liability to the driver for the parking service is direct, not mediated.
- The insurance requirement changes completely.

These two positions produce different products, not just different paperwork. They
change the terms of service, the invoice, the pricing display, the refund mechanics and
the capital requirement.

### 3.2 What the platform is designed to be

The spec kernel and the drafts in this batch are written on the **pure intermediary**
footing: the host sets the price, the host sets the cancellation policy from the four in
the kernel, the host controls availability, the host grants access, and ParkSpace takes
`HOST_COMMISSION_PCT` 0.10 from the host and `DRIVER_SERVICE_FEE_PCT` 0.05 from the
driver. `21_Host_Terms.md` clause 13 and `22_Driver_Terms.md` clause 10 both state the
venue position expressly.

**REVIEW REQUIRED:** whether that design actually holds in law, and whether any feature
on the roadmap breaks it. Dynamic pricing set by the platform, a platform-set minimum
price, a platform guarantee of the parking outcome, a platform-branded damage cover, or
platform staff controlling a gate would each push the platform towards being treated as
the supplier. Counsel must review the feature set, not only the words in the terms,
because substance prevails over labels. This review must be repeated whenever the
pricing or guarantee model changes.

### 3.3 Intermediary due diligence

If the safe harbour is to be available, the platform must satisfy the due diligence
obligations that attach to it. Those typically include publishing rules and privacy
policy and user agreement, informing users of prohibited content and conduct, acting on
lawful orders and complaints within prescribed timelines, retaining certain records, and
appointing a grievance officer with published contact details and defined response times.

**REVIEW REQUIRED:** the precise obligations, the applicable timelines, the record
retention period, whether ParkSpace falls within any category attracting additional
obligations, and whether a parking marketplace is an intermediary at all in respect of
the transaction (as opposed to in respect of user-generated listing content, where the
position may be clearer). Counsel to confirm. The grievance officer requirement is
treated as a firm commitment in section 11 regardless, because it is required under
consumer protection e-commerce rules as well.

---

## 4. Payments: why the platform must not hold funds

### 4.1 The rule

ParkSpace should **not** collect driver money into its own account and then pay hosts
out of that account. Accepting money from one person for the purpose of paying it to
another is a regulated payment activity in India. Operating a payment aggregator
function without authorisation is a regulatory exposure that no early-stage company
should take, and a bank will close the account long before the regulator gets involved.

### 4.2 The correct architecture

1. Use an **authorised payment aggregator**. Razorpay is the adapter named in the spec
   kernel. Verify current authorisation status with the provider at onboarding.
2. Use the aggregator's **route or split settlement** product so that funds move from the
   driver into the aggregator's regulated escrow and settle directly to the host's linked
   account, with the platform's commission and service fee split off at source.
3. The platform's own bank account receives **only** its commission and service fee. It
   never receives the host's share.
4. Host payout details are onboarded and, ideally, held by the aggregator rather than by
   ParkSpace, so that ParkSpace is not storing bank credentials at all. See
   `19_Privacy_Requirements.md` section 2.
5. Refunds go back to the original instrument through the aggregator, never as a manual
   transfer from a company account to a driver. This is both a regulatory point and a
   fraud control, see `18_Security_Requirements.md` section 6.4.
6. The wallet and coupon features in the MVP scope must be designed as **discount
   mechanics, not stored value**. A wallet that holds cash the user paid in, and that can
   be withdrawn, looks like a prepaid payment instrument and attracts a separate
   regulatory regime.

**REVIEW REQUIRED:** whether the wallet as designed, including referral credit and
refunded amounts credited to wallet rather than to the instrument, crosses the line into
a prepaid payment instrument. This is a hard question and must be answered by counsel
before the wallet ships. The safe design, until answered, is: wallet credit is
non-refundable, non-transferable, non-withdrawable, expires, and can only reduce the
price of a future booking. Refunds of money the driver paid go to the original
instrument.

**REVIEW REQUIRED:** the payment aggregator's own merchant onboarding rules will impose
KYC on hosts receiving payouts above certain volumes, and will impose restrictions on
prohibited categories. Confirm with the provider what host KYC the platform must collect,
because that directly determines the verification document requirements in
`19_Privacy_Requirements.md`.

---

## 5. GST: the questions, not the answers

The spec kernel isolates every tax decision in `lib/pricing/tax.ts` precisely because the
answers below are not known. `GST_PCT` defaults to 0.18 and is applied to the service fee
in the kernel's money model. That is a placeholder implementation, not a determination.

Questions for the chartered accountant, each of which materially changes the code:

1. **Is ParkSpace an electronic commerce operator for GST purposes, and does the
   liability to pay tax on the parking supply get cast on it?** If yes, the platform may
   have to charge and remit tax on the full booking value even for hosts below the
   registration threshold, and must register irrespective of turnover.
2. **What is the classification and rate of the underlying supply?** Renting of a parking
   space is a supply of service. The rate, the classification code and whether any
   exemption touches residential arrangements must be confirmed.
3. **What is the classification and rate of the platform's own supply**, that is the
   commission charged to the host and the service fee charged to the driver?
4. **Is compulsory registration triggered**, and from what date, irrespective of the
   turnover threshold that would otherwise apply?
5. **Is tax collection at source applicable to the platform**, at what rate, on what
   value (net of returns), with what monthly return and what annual statement?
6. **What invoice must be issued, by whom, to whom?** Specifically: does ParkSpace issue
   an invoice on behalf of the host to the driver, does the host issue it, and what must
   the document contain? This determines the receipt the driver sees in the app.
7. **What is the position for an unregistered host?** Most driveway hosts will be
   individuals well below any threshold. Does the platform have to account for tax on
   their behalf, and does the host need to register because they are supplying through an
   electronic commerce operator?
8. **Place of supply.** Kolkata-first makes this look simple, but a driver from outside
   West Bengal booking a Kolkata space, and a host resident elsewhere owning a Kolkata
   space, both need a rule. Immovable property rules may apply.
9. **Reverse charge**, if any, on any leg.
10. **What happens on a partial refund** under the `moderate` and `strict` policies in
    section 8 of the spec kernel, where the driver gets half back and the host keeps
    half? Is tax due on the retained half, on the commission on the retained half, on the
    forfeited service fee?

**REVIEW REQUIRED on all ten.** Until answered, the platform must not launch with real
money, and `GSTIN` must remain the placeholder `[GSTIN]` in every document and template.

---

## 6. TDS under section 194-O

An electronic commerce operator may be required to deduct tax at source on the gross
amount of sales of goods or services facilitated through its platform for an e-commerce
participant, subject to thresholds and to exemptions for certain individual and Hindu
undivided family participants below a turnover limit who furnish PAN or Aadhaar.

Open items:

1. Is ParkSpace an e-commerce operator within that provision, and is a driveway host an
   e-commerce participant?
2. What is the applicable rate at the time of launch?
3. On what value: gross booking amount, or amount net of the platform's commission?
4. Which host exemption applies, and what does the platform need to collect (PAN,
   declaration) to apply it?
5. What is the consequence of a host not furnishing PAN, in terms of a higher deduction
   rate?
6. What quarterly return and what certificate must the platform issue to each host?
7. How does a refund or cancellation after deduction get unwound?
8. Does any equalisation levy or other provision interact with this?

**REVIEW REQUIRED on all eight.** The product consequence is concrete: if withholding
applies, the host payout formula in the spec kernel (`host_payout = taxable_amount -
host_commission`) gains a further deduction, the host earnings screen must show it, a
withholding certificate must be producible, and PAN becomes a required field in host
onboarding with all the privacy consequences that follow.

---

## 7. The host-side tax question

Is a homeowner who rents out a driveway carrying on a business?

This matters because it determines: whether the host's receipts are business income,
income from house property or income from other sources; whether the host must register
for GST; whether the host must issue invoices; and what the platform must tell hosts at
onboarding so that it is not effectively giving tax advice.

The honest position for the platform is: **ParkSpace does not and cannot advise hosts on
their tax affairs.** `21_Host_Terms.md` clause 8 places the obligation on the host and
tells the host to take their own advice. What the platform must do is:

1. Provide accurate, complete earnings statements that a host can hand to their own
   accountant, including gross, commission, any withholding and net, per booking and in
   aggregate per financial year.
2. Not characterise host income in the product. Avoid copy such as "tax free" or
   "passive income, no paperwork".
3. Collect whatever the platform is legally required to collect (PAN, declarations) once
   section 6 is answered, and no more.

**REVIEW REQUIRED:** whether the platform has any obligation to inform hosts of their
registration obligations, and whether providing an earnings statement that resembles a
tax document creates any exposure.

---

## 8. Insurance, and the rule about promising cover

### 8.1 The rule

**The platform must never promise cover it has not bought.** No copy, no badge, no
tooltip, no support macro may say or imply that a vehicle is insured, protected,
guaranteed or covered unless a real policy exists, its insurer is named, its limits are
stated and its exclusions are linked. "ParkSpace Protection" as a marketing phrase over
nothing is a misrepresentation, and in a dispute it is the single fact that will hurt the
company most.

### 8.2 Policies to consider

| Cover | Why | Status |
| --- | --- | --- |
| Commercial general liability | Third party bodily injury and property damage claims arising from platform operations | **REVIEW REQUIRED**, obtain quotes |
| Professional indemnity or technology errors and omissions | Claims arising from the platform's own service failure, for example a double booking or a data error | **REVIEW REQUIRED** |
| Cyber liability | Breach response cost, notification cost, third party claims | **REVIEW REQUIRED**, read with `18_Security_Requirements.md` section 5 |
| Directors and officers | Personal exposure of founders and directors | **REVIEW REQUIRED** |
| A marketplace damage protection product, if offered | Damage to a vehicle while parked, or damage to a host's property by a driver | **REVIEW REQUIRED**. Offering this may require an insurance intermediary registration, and may also push the platform away from the pure intermediary position in section 3 |

### 8.3 Until cover exists

The current drafts take the only defensible position: `21_Host_Terms.md` clause 14 and
`22_Driver_Terms.md` clause 11 state plainly that the platform provides no insurance,
that the host's property insurance and the driver's motor insurance are each that party's
own responsibility, and that each party should confirm with their own insurer whether
their policy responds to a commercial letting or to parking on private property.

**REVIEW REQUIRED:** whether a standard Indian motor policy responds to theft or damage
on private residential property let through a marketplace, and whether a standard
householder's policy responds to a commercial letting of the driveway. Both answers are
likely to be "it depends on the policy wording", and hosts and drivers must be told to
check rather than reassured.

---

## 9. Municipal, land use and society risk

This is the risk most technology founders miss, and in a dense Indian city it is the risk
most likely to stop a listing.

### 9.1 Residential driveways

**REVIEW REQUIRED:** whether letting a residential parking space commercially is
permitted under the applicable building rules, land use classification and the sanctioned
plan for the property, and whether it requires any municipal permission in the Kolkata
Municipal Corporation area. A change of use from residential parking to commercial
parking may be a planning matter. The answer may differ between a standalone house, a
plot with a garage and an apartment complex.

### 9.2 Housing societies and apartment buildings

Most Kolkata apartment parking is either common area allotted to a member, or a bay whose
transfer is restricted by the society's bye-laws or by the conveyance. A member letting
their allotted bay to a stranger who then enters the premises daily is very likely to
need the society's permission, and may be prohibited outright.

The platform's controls:

1. `21_Host_Terms.md` clause 3 requires the host to warrant they have the authority to
   list, including any society or landlord permission.
2. The listing wizard should ask a direct question: is this space inside a housing
   society or gated complex, and do you have written permission. A "no" should block
   publication of that listing type.
3. A complaint from a society or a building manager suspends the listing immediately,
   per `18_Security_Requirements.md` section 6.2.

**REVIEW REQUIRED:** whether the platform bears any liability towards a society for
facilitating a breach of its bye-laws, and whether the warranty and indemnity in the host
terms are sufficient protection.

### 9.3 Commercial premises

A shopping centre, hotel, office or restaurant may have an occupancy certificate, a
sanctioned plan or a licence condition that requires its parking to be reserved for its
own patrons and staff. Letting that parking to the public may breach that condition, and
may also breach a lease. The same question arises for a commercial car park operating
under a municipal licence.

**REVIEW REQUIRED:** what a commercial host must confirm before listing, and whether the
platform should require sight of an occupancy certificate, a no-objection certificate or
a landlord consent for commercial listings. Operator-tier hosts under the spec kernel role
table are the most likely to hit this.

### 9.4 Street and public parking

Listing any portion of a public road, footpath or municipally controlled parking bay must
be prohibited outright in the product and in the host terms. It is not the host's to let.
`21_Host_Terms.md` clause 11 prohibits it.

---

## 10. Consumer protection and e-commerce rules

The platform deals with consumers, so consumer protection law and the e-commerce rules
made under it are directly relevant, independent of the intermediary question.

Obligations the platform should assume it has, subject to review:

1. **Identity disclosure.** The legal name, principal geographic address, registered
   office, website, customer care contact and grievance officer details must be
   displayed.
2. **No unfair trade practice, no misleading advertisement.** This is the legal teeth
   behind the insurance rule in section 8.1 and behind any "guaranteed" claim. The spec
   kernel's "guaranteed inventory" pillar is defensible because the exclusion constraint
   genuinely delivers it, but the marketing copy must not extend the guarantee to things
   the platform cannot control, such as the space being physically clear on arrival.
3. **Transparent pricing.** The total payable, including the service fee and any tax,
   must be displayed before the driver commits. No fee may be introduced after the price
   is shown. The kernel's `total_amount` must be the number the driver sees.
4. **No fake reviews.** Review integrity is both a fraud control (see
   `18_Security_Requirements.md` section 6.3) and a consumer law obligation. The platform
   must publish how reviews are collected and must not selectively suppress negative
   reviews.
5. **Cancellation and refund terms displayed before purchase**, which the four policies
   in the kernel and `23_Refund_Policy.md` satisfy, provided the applicable policy is
   shown on the listing page and in the checkout summary.
6. **A stated refund timeline**, see `23_Refund_Policy.md` section 9.
7. **Record retention** of seller (host) information sufficient to identify a host in a
   consumer complaint.

**REVIEW REQUIRED:** the precise applicability of the e-commerce rules to this platform,
whether the platform is a marketplace e-commerce entity or an inventory e-commerce
entity, and the exact disclosures and timelines required.

---

## 11. Grievance officer

The platform must appoint a grievance officer and publish the name, designation, email
address and a contact mechanism, and must acknowledge and resolve complaints within
defined timelines.

Draft commitment, to be confirmed against the applicable rules:

- Name: `[GRIEVANCE OFFICER NAME]`, designation `[DESIGNATION]`
- Email: `[GRIEVANCE OFFICER EMAIL]`
- Address: `[REGISTERED ADDRESS]`
- Acknowledgement within 48 hours of receipt
- Resolution target within 30 days

**REVIEW REQUIRED:** whether separate officers are required for consumer grievances and
for data protection grievances, whether a resident grievance officer or a chief
compliance officer is required, whether the timelines above meet the statutory minimum,
and whether a distinct nodal contact person is required. Note that
`19_Privacy_Requirements.md` section 5 also routes data principal grievances to this
officer, and one person may not be able to hold both roles.

---

## 12. Trademark, domain and brand

1. Run a trademark availability search for "ParkSpace" in the relevant classes before
   spending on brand. **REVIEW REQUIRED:** the name is descriptive and common, and may
   be unregistrable as a word mark or already occupied. Expect to need a distinctive
   logo mark, a coined word, or a composite mark.
2. Likely classes: technology and software services, and services relating to parking and
   vehicle storage. A trademark attorney must confirm the class set.
3. Secure the domain and the obvious variants, and the social handles, before launch.
4. File the trademark application in the company's name, not a founder's personal name.
5. Ensure all code, designs and content created by contractors are assigned to the
   company in writing. A contractor agreement without an assignment clause means the
   company does not own its own product.
6. Open source licence compliance for every dependency. **REVIEW REQUIRED** on the
   licence set once dependencies are frozen. OpenStreetMap data carries attribution
   obligations under its licence, and the map interface must display the required
   attribution.
7. Do not use any third party's marks in listing photographs or marketing without
   permission.

---

## 13. Required document set

| Document | Purpose | Status |
| --- | --- | --- |
| Terms of Service (platform-wide) | The umbrella contract with every user | Not yet drafted, **REVIEW REQUIRED** on whether one umbrella plus two role agreements is the right architecture |
| Host Agreement | `21_Host_Terms.md` | Draft, unreviewed |
| Driver Agreement | `22_Driver_Terms.md` | Draft, unreviewed |
| Refund and Cancellation Policy | `23_Refund_Policy.md` | Draft, unreviewed |
| Privacy Policy | `24_Privacy_Policy.md` | Draft, unreviewed |
| Cookie notice | Part of the privacy policy, or separate | Draft within `24_Privacy_Policy.md` section 6 |
| Acceptable use and community rules | Prohibited conduct, listing standards, review rules | Not yet drafted |
| Operator and staff seat addendum | Multi-location hosts with staff, per the spec kernel role table | Not yet drafted |
| Data processing agreements | One per processor in `19_Privacy_Requirements.md` section 7 | Not started |
| Contractor and employee agreements with IP assignment and confidentiality | Owning the product | Not started |
| Founders agreement and shareholders agreement | Vesting, control, transfer restrictions | Not started |
| Board and shareholder resolutions | Bank, payment aggregator, officer appointments | On incorporation |
| Grievance redressal mechanism page | Section 11 | Draft placeholder |
| Disclosures page | Entity identity under section 10.1 | Not yet drafted |

---

## 14. Open legal questions and who answers each

| # | Question | Professional |
| --- | --- | --- |
| 1 | Which entity structure, with what capital and shareholding | Chartered accountant with company secretary |
| 2 | Is ParkSpace a pure intermediary or the supplier of the parking service | Advocate |
| 3 | Does the intermediary safe harbour apply, and what due diligence attaches | Advocate |
| 4 | Which features on the roadmap would break the intermediary position | Advocate |
| 5 | Is ParkSpace an electronic commerce operator for GST, and is liability cast on it | Chartered accountant |
| 6 | Classification and rate for the parking supply and for the platform's commission and fee | Chartered accountant |
| 7 | Compulsory GST registration, TCS applicability, returns and invoicing obligations | Chartered accountant |
| 8 | Position for unregistered hosts, and place of supply rules | Chartered accountant |
| 9 | Tax treatment of partial refunds and forfeited service fees under the four policies | Chartered accountant |
| 10 | Section 194-O applicability, rate, base, exemptions, PAN collection and certificates | Chartered accountant |
| 11 | Characterisation of host income and any platform duty to inform hosts | Chartered accountant |
| 12 | Does the wallet constitute a prepaid payment instrument | Advocate, with the payment aggregator |
| 13 | Payment aggregator onboarding, host KYC requirements, settlement architecture | Payment aggregator with advocate |
| 14 | Which insurance policies are required, and can a damage protection product be offered | Insurance broker with advocate |
| 15 | Whether motor and householder policies respond to marketplace parking | Insurance broker |
| 16 | May a residential driveway be let commercially under Kolkata building and land use rules | Advocate, property or municipal law |
| 17 | Housing society bye-laws: what permission a member needs, and platform exposure | Advocate, property law |
| 18 | Commercial premises: occupancy certificate and lease constraints on letting parking | Advocate, property law |
| 19 | Applicability and precise obligations of consumer protection e-commerce rules | Advocate |
| 20 | Grievance officer: how many, what qualifications, what timelines | Advocate |
| 21 | Trademark availability and class selection for "ParkSpace" | Trademark attorney |
| 22 | Open source and OpenStreetMap attribution compliance | Advocate, technology |
| 23 | All twelve open items in `19_Privacy_Requirements.md` section 11 | Advocate, data protection |
| 24 | Dispute resolution clause: is the arbitration clause in the host and driver terms enforceable against consumers | Advocate |
| 25 | Statutory retention period for financial records | Chartered accountant |

No entry in this table may be closed by an engineering decision, a founder's
reading of a blog post, or the contents of this document.

---

## 15. Launch gate

ParkSpace must not accept real money from a real user until, at minimum:

1. The entity exists, with a bank account in its name.
2. Question 2 in section 14 is answered in writing.
3. Questions 5 through 11 are answered in writing and `lib/pricing/tax.ts` implements the
   answers.
4. The payment aggregator relationship is live, with split settlement, and the platform
   holds no user funds.
5. The host and driver agreements, the refund policy and the privacy policy have been
   settled by an advocate and published.
6. The grievance officer is appointed, named on the site and reachable.
7. The pre-launch security checklist in `18_Security_Requirements.md` section 7 is
   complete.
8. No marketing claim about insurance, protection or guarantee exists that is not backed
   by a real policy or a real technical guarantee.
