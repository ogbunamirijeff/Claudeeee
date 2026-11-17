# Data protection (Nigeria Data Protection Act 2023)

How Jiko handles personal data. ✅ = in place now; 🔜 = planned, with its phase.

## Lawful basis and consent

- ✅ Users accept the Terms and Privacy Policy at sign-up. The accepted version and time are stored (`User.consentVersion`, `consentedAt`) and audited. Bumping `CONSENT_VERSION` in `packages/shared` makes everyone re-accept at their next login.
- Processing for matching, payments and dispute handling rests on contract performance. Verification checks and background checks rest on legitimate interest plus explicit artisan consent during onboarding (🔜 Phase 4).

## Data minimisation

- ✅ OTP codes are never stored, only an HMAC. Refresh tokens are stored hashed.
- ✅ Bank account numbers are encrypted at the application level (AES-256-GCM, key from `DATA_ENCRYPTION_KEY`, bound to the row with AAD). Once the Paystack transfer recipient exists, the ciphertext is deleted and only the last 4 digits are kept (🔜 wired up in Phase 3/4).
- ✅ Phone numbers are hidden from the other party until a job is paid.
- ✅ OTP message bodies are never logged by the Termii provider.

## Sensitive documents (ID, verification evidence) — 🔜 Phase 4

- Stored in a **private** bucket separate from job photos (`File.sensitivity = SENSITIVE`, enforced by a DB CHECK on file kind).
- Admins only. Access is through short-lived signed URLs (≤ 5 minutes), and **every view writes an `AuditLog` entry** (`file.view`).
- Never sent through WhatsApp or SMS, and never cached by clients.

## Security

- ✅ Role-based access control on every endpoint, deny-by-default, verified by a test.
- ✅ Admin actions are recorded in an append-only audit log (a DB trigger blocks edits and deletes) with actor, IP and before/after values.
- ✅ TLS in transit (platform-terminated); helmet security headers; httpOnly session cookies on web; OS keystore on mobile.
- Key rotation: `DATA_ENCRYPTION_PREVIOUS_KEYS` keeps old keys for decryption, and `FieldEncryption.needsRotation()` identifies values to re-encrypt.

## Data subject rights — 🔜 Phase 6 (ops tooling)

- Access and portability: admin export of a user's profile, jobs, messages and reviews.
- Erasure: `UserStatus.DELETED` anonymises personal data (name, email, phone replaced). Financial records, the ledger and the audit log are kept for the statutory retention period, linked only by internal IDs.
- Correction: users edit their own profile through `PATCH /v1/me`.

## Retention (proposed, to confirm with counsel)

| Data                           | Retention                                  |
| ------------------------------ | ------------------------------------------ |
| OTP challenges                 | 30 days (rate-limit evidence), then purge  |
| Revoked/expired refresh tokens | 90 days                                    |
| Verification documents         | Duration of artisan relationship + 2 years |
| Job photos and messages        | 2 years after job completion               |
| Ledger, payments, audit log    | 6 years (financial records)                |

## Breach response

The NDPA requires notifying the NDPC within 72 hours of becoming aware of a breach. The incident runbook will be added in Phase 6.
