# Privacy and compliance (US / Texas pilot)

How Jiko handles personal data and regulated activities for the Houston pilot.
✅ = in place now; 🔜 = planned, with its phase. Not legal advice — confirm with counsel before launch.

## Text messages (TCPA, CTIA, carrier rules)

- ✅ Sign-up captures express consent to receive account and job texts ("Msg & data rates may apply. Reply STOP to opt out."), stored as `User.consentVersion` + `consentedAt` and audited. Bumping `CONSENT_VERSION` in `packages/shared` makes everyone re-accept at next login.
- ✅ OTP texts are transactional and contain no marketing.
- 🔜 Phase 5: honour STOP/HELP keywords (Twilio Advanced Opt-Out), quiet hours for non-urgent texts, no marketing texts without separate opt-in.
- 🔜 Before launch: A2P 10DLC brand/campaign registration (or verified toll-free number).

## Payments (PCI DSS, money transmission)

- Card and bank data never touch Jiko servers: Stripe Checkout/Elements collect them (PCI SAQ A scope).
- Funds are held in Jiko's Stripe balance and paid to pros' **Stripe Connect Express** accounts (separate charges and transfers), so Stripe is the regulated money mover.
- ✅ Jiko never stores bank account or routing numbers — Stripe holds them. (The app-level AES-256-GCM `FieldEncryption` module remains available for any field that must be stored encrypted.)
- 🔜 Stripe issues 1099 forms to pros; Jiko stores only the Stripe account ID.

## Background checks (FCRA)

- 🔜 Phase 4: background checks via an FCRA-compliant consumer reporting agency (e.g. Checkr), with the standalone disclosure, written authorisation, and pre-adverse / adverse action notices before declining a pro based on a report. Texas also limits use of some older records — the provider applies those rules.
- Jiko stores the provider's report ID and outcome, not the report itself.

## Licenses and insurance

- 🔜 Phase 4: state license verified against the Texas registries (TSBPE for plumbing; TDLR for electrical and HVAC), stored with license number, board and expiry; insurance certificate (COI) stored as sensitive evidence with expiry tracking. Expired license or insurance suspends the Craft Seal automatically.

## Personal data (Texas Data Privacy and Security Act, other state laws)

- ✅ Data minimisation: OTP codes never stored (HMAC only); refresh tokens hashed; phone numbers hidden from the other party until payment; full address and access notes shown to a pro only after they accept.
- ✅ Sensitive documents (ID, license, insurance, background-check evidence) are `SENSITIVE` files in a private bucket: admins only, short-lived signed URLs, every view audited (`file.view`).
- ✅ Role-based access control on every endpoint (deny by default, test-enforced); admin actions in an append-only audit log with actor, IP and before/after.
- 🔜 Phase 6: privacy notice, data-subject requests (access, correction, deletion, opt-out of sale/targeted ads — Jiko does neither), erasure via `UserStatus.DELETED` anonymisation while keeping financial records.

## Retention (proposed, to confirm with counsel)

| Data                           | Retention                                  |
| ------------------------------ | ------------------------------------------ |
| OTP challenges                 | 30 days, then purge                        |
| Revoked/expired refresh tokens | 90 days                                    |
| Verification documents         | Duration of the pro relationship + 3 years |
| Background-check references    | As required by FCRA / provider agreement   |
| Job photos and messages        | 2 years after job completion               |
| Ledger, payments, audit log    | 7 years (financial records / IRS)          |

## Security incidents

Texas requires notifying affected individuals within 60 days of determining a breach, and the Texas Attorney General when 250+ Texans are affected. The incident runbook will be added in Phase 6.
