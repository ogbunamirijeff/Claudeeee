# Jiko

Marketplace connecting **Craft Seal–verified home pros** (plumbers, electricians, HVAC techs) with homeowners. Trust is the product: licensed, insured and background-checked pros, itemised quotes, and payment held until the job is done.

Pilot: ~30 pros and ~100 jobs in **Houston, TX** (Houston Heights, Midtown, Katy). Times are Houston time (`America/Chicago`).

| Phase | Scope                                                                         | Status                                                        |
| ----- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1     | Monorepo, DB schema, phone + OTP auth, roles, audit log                       | ✅ done                                                       |
| 2     | Job request → admin assignment → quote → approval                             | ✅ done (web + API; mobile screens pending the Expo decision) |
| 3     | Stripe Connect payment, held funds, materials advance, release/refund, ledger | —                                                             |
| 4     | Pro onboarding + Craft Seal verification                                      | —                                                             |
| 5     | Reviews, disputes, notifications (SMS/push)                                   | —                                                             |
| 6     | Admin metrics, marketing site, deploy                                         | —                                                             |

## Repository layout

```
apps/
  api/      NestJS + Prisma (PostgreSQL). REST API under /v1
  web/      Next.js App Router + Tailwind: marketing, client booking, admin dashboard
  mobile/   Expo (expo-router): one app, Client and Pro modes
packages/
  shared/   Enums, zod schemas, phone + money helpers, state machines (used by all apps)
  tsconfig/ Shared TypeScript configs
docs/       Design notes (privacy & compliance, …)
```

Designs: Figma file "Jiko — Phase 2 UI" (booking flow, offer + quote builder, quote approval, admin queue). Trade illustrations were generated in Canva and live in `apps/web/public/trades/` (160 px WebP, ~2 KB each).

## Prerequisites

- Node.js ≥ 20.11 and pnpm 10 (`corepack enable`)
- PostgreSQL 16 and Redis 7 — easiest via `docker compose up -d` (also starts MinIO as local S3)

## Local setup

```bash
pnpm install
docker compose up -d                       # or use your own Postgres/Redis

cp .env.example apps/api/.env              # then fill the secrets:
#   JWT_ACCESS_SECRET, OTP_PEPPER:  openssl rand -base64 48
#   DATA_ENCRYPTION_KEY:            openssl rand -base64 32
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

pnpm --filter @jiko/shared build
pnpm db:migrate                            # apply migrations
pnpm --filter @jiko/api db:seed:demo       # trades, Houston areas, admin, 30 pros, clients, open jobs

pnpm dev                                   # API :4000, web :3000, Expo dev server
```

With `SMS_PROVIDER=console` the OTP is printed in the API log, e.g.
`[dev sms] to +17135550100: Your Jiko code is 482913…`. The seeded admin is `(713) 555-0100`; demo pros are `(713) 555-0101…0130` and clients `(832) 555-0150…0159` — 555-01XX numbers are reserved for fiction and never reach a real phone.

## Commands

| Command                                | What it does                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm build` / `pnpm typecheck`        | Build / type-check every package                                                                      |
| `pnpm lint` / `pnpm format`            | ESLint (type-aware) / Prettier                                                                        |
| `pnpm test`                            | Unit tests (shared + API)                                                                             |
| `pnpm test:e2e`                        | API end-to-end tests against real Postgres (`jiko_test`; override with `TEST_DATABASE_URL`) and Redis |
| `pnpm db:migrate`                      | Create/apply migrations in development                                                                |
| `pnpm --filter @jiko/api db:deploy`    | Apply migrations in production (non-destructive)                                                      |
| `pnpm db:seed`                         | Reference data only (trades, areas, first admin) — safe in production                                 |
| `pnpm --filter @jiko/api db:seed:demo` | Demo data; refuses to run when `NODE_ENV=production`                                                  |

The e2e tests need the test database once: `createdb -O jiko jiko_test`.

## API

All routes are under `/v1` except `/health`. Errors share one shape: `{ statusCode, code, message, details? }`. Every route declares `@Public()`, `@Authenticated()` or `@Roles(...)`; undeclared routes are denied (a test enforces this).

| Method    | Path                                                                     | Access                | Notes                                                                                                                               |
| --------- | ------------------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/auth/otp/request`                                                      | public                | `{ phone }` — any US format (`(713) 555-0123`, `+1…`)                                                                               |
| POST      | `/auth/otp/verify`                                                       | public                | `{ phone, code, acceptTerms? }` → tokens + user. `acceptTerms` (Terms, Privacy, TCPA texts) required at sign-up / when terms change |
| POST      | `/auth/refresh`, `/auth/logout`                                          | public                | `{ refreshToken }`                                                                                                                  |
| GET/PATCH | `/me`                                                                    | signed in             | Profile                                                                                                                             |
| GET       | `/catalog/trades`, `/catalog/areas`                                      | public                |                                                                                                                                     |
| POST      | `/files/uploads` → POST to `url` → `/files/:id/complete`                 | signed in             | Direct-to-storage upload (presigned POST, ≤ 2 MB, JPEG/PNG/WebP)                                                                    |
| GET       | `/files/:id/url`                                                         | participants          | 5-minute signed URL; sensitive files admin-only, every view audited                                                                 |
| POST/GET  | `/jobs`, `/jobs/:id`                                                     | client / participants | Create (ZIP must be in Houston area), view tailored to client, pro or admin                                                         |
| POST      | `/jobs/:id/cancel`                                                       | client, admin         | Before payment                                                                                                                      |
| GET/POST  | `/jobs/:id/messages`                                                     | participants          | Chat; contact details masked and flagged until payment. Poll with `?after=`                                                         |
| GET       | `/artisan/jobs`                                                          | pro                   | Open offers + active jobs                                                                                                           |
| POST      | `/assignments/:id/accept`, `/decline`                                    | pro                   | Race-safe                                                                                                                           |
| POST      | `/jobs/:id/quotes`                                                       | pro                   | Itemised; split snapshotted; revisions supersede                                                                                    |
| POST      | `/quotes/:id/approve`, `/reject`                                         | client                |                                                                                                                                     |
| GET       | `/admin/jobs`, `/admin/jobs/summary`                                     | admin                 | Queue / pipeline                                                                                                                    |
| GET/POST  | `/admin/jobs/:id/candidates`, `/assign`, `/withdraw`                     | admin                 | Ranked candidates; audited                                                                                                          |
| GET/POST  | `/admin/quotes/pending-review`, `/admin/quotes/:id/review`               | admin                 | Materials-heavy quotes; audited                                                                                                     |
| GET/PATCH | `/admin/users`, `/admin/users/:id/roles`, `/status`, `/admin/audit-logs` | admin                 | Audited                                                                                                                             |

### Auth design

- **OTP**: 6 digits, stored only as `HMAC-SHA256(pepper, phone:code)`. Valid 5 min, 5 attempts (counted atomically), 60 s resend cooldown, 5 codes per phone and 20 per IP per hour. Sent with Twilio.
- **Sessions**: 15-min access JWT + 30-day rotating refresh token (hashed); re-use of a rotated token revokes the family and is audited.
- **RBAC**: roles and status read from the DB on every request, so suspensions apply immediately. Users can be both client and pro.
- **Web**: Next.js proxies the API so tokens stay in httpOnly cookies; same-origin checks on mutations. **Mobile**: tokens in the OS keystore.

### Data integrity (enforced in Postgres)

CHECKs on all money (non-negative integer cents, quote totals and split sum to the total, advance within cap), US E.164 phones, 5-digit ZIPs, ratings 1–5; append-only triggers on `ledger_entries`, `audit_logs`, `job_status_events`; partial unique indexes for one live assignment/quote/dispute/payment per job.

## Business rules

- **Currency**: USD, stored as integer cents.
- **Commission**: 15% of the whole quote (labour + materials), taken from labour first; if labour can't cover it, only the shortfall comes out of materials.
- **Materials advance**: when the pro starts on site (with a before-photo), the materials share is released, up to **$500** (`MATERIALS_ADVANCE_CAP_CENTS`); the excess waits for completion. Non-refundable by default; an admin override refunds it from Jiko's funds (`PLATFORM_LOSSES`).
- **Materials-heavy quotes**: materials > 70% of the total need Jiko review before the client can pay.
- **Materials receipt**: required before a job with materials can be marked `WORK_SUBMITTED`.
- **Fees**: Stripe processing and payout fees are absorbed by Jiko and recorded under `PROCESSING_FEES`.
- **Offers**: expire after 2 working hours (7 AM–8 PM Houston time, DST-aware); offers made outside that window count from 7 AM.
- **Masking**: phone numbers hidden until paid; pre-payment chat masks phones, emails, handles, Cash App tags and flags Venmo/Zelle/"pay me directly" for ops.
- **Craft Seal (US)**: government ID, state trade license (Texas: TSBPE for plumbing, TDLR for electrical and HVAC), general liability insurance, FCRA-compliant background check, two references, skills assessment.
- **Guarantee**: 7-day redo on platform-paid jobs.

## Deploy (outline; finalised in Phase 6)

- **API → Railway or Render**: build `pnpm install --frozen-lockfile && pnpm --filter @jiko/api... build`; release `pnpm --filter @jiko/api db:deploy`; start `node apps/api/dist/main.js`. Set `TRUST_PROXY=true`, `SMS_PROVIDER=twilio`, `STORAGE_DRIVER=s3`, fresh secrets, managed Postgres + Redis.
- **Web → Vercel**: root directory `apps/web`; set `API_URL`.
- **Mobile → EAS Build**: set `EXPO_PUBLIC_API_URL` per build profile.
- **Before launch — carrier & payment onboarding (allow 2–4 weeks)**:
  - Twilio **A2P 10DLC brand + campaign registration** (or a verified toll-free number). Unregistered US business texting is blocked by carriers.
  - **Stripe Connect** platform profile (Express accounts, separate charges and transfers) — Stripe handles pro KYC, bank details and 1099-K/NEC forms.
  - Storage bucket CORS: allow `POST` from the web origin for presigned uploads.

See [docs/privacy-and-compliance.md](docs/privacy-and-compliance.md).
