# Jiko

Marketplace connecting **Craft Seal–verified artisans** (plumbers, electricians, AC technicians) with clients in Lagos. Trust is the product: vetted artisans, itemised quotes, and payment held until the job is done.

Pilot scope: ~30 artisans, ~100 jobs in Lekki, Ajah and Yaba.

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, DB schema, phone + OTP auth, roles, audit log | ✅ done |
| 2 | Job request → admin assignment → quote → approval | — |
| 3 | Paystack payment, escrow, materials advance, release/refund, ledger | — |
| 4 | Artisan onboarding + Craft Seal verification | — |
| 5 | Reviews, disputes, notifications (WhatsApp/SMS/push) | — |
| 6 | Admin metrics, marketing site, deploy | — |

## Repository layout

```
apps/
  api/      NestJS + Prisma (PostgreSQL). REST API under /v1
  web/      Next.js App Router + Tailwind: marketing, client booking, admin dashboard
  mobile/   Expo (expo-router): one app, Client and Artisan modes
packages/
  shared/   Enums, zod schemas, phone + money helpers, state machines (used by all apps)
  tsconfig/ Shared TypeScript configs
docs/       Design notes (data protection, …)
```

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
pnpm --filter @jiko/api db:seed:demo       # trades, areas, admin, 30 artisans, clients, open jobs

pnpm dev                                   # API :4000, web :3000, Expo dev server
```

With `SMS_PROVIDER=console` the OTP is printed in the API log, e.g.
`[dev sms] to +2348000000001: Your Jiko code is 482913…`. The seeded admin is `0800 000 0001`.

Mobile: `pnpm --filter @jiko/mobile android`. The Android emulator reaches your machine at `10.0.2.2`; on a physical phone set `EXPO_PUBLIC_API_URL` to your LAN IP.

## Commands

| Command | What it does |
|---|---|
| `pnpm build` / `pnpm typecheck` | Build / type-check every package |
| `pnpm test` | Unit tests (shared + API) |
| `pnpm test:e2e` | API end-to-end tests against a real Postgres (`jiko_test` database; override with `TEST_DATABASE_URL`) |
| `pnpm db:migrate` | Create/apply migrations in development |
| `pnpm --filter @jiko/api db:deploy` | Apply migrations in production (non-destructive) |
| `pnpm db:seed` | Reference data only (trades, areas, first admin) — safe in production |
| `pnpm --filter @jiko/api db:seed:demo` | Demo data; refuses to run when `NODE_ENV=production` |

The e2e tests need the test database to exist once: `createdb -O jiko jiko_test`.

## API (Phase 1)

All routes are under `/v1` except `/health`. Errors share one shape: `{ statusCode, code, message, details? }`.

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/otp/request` | public | `{ phone }` — any Nigerian format (`0803…`, `+234…`) |
| POST | `/auth/otp/verify` | public | `{ phone, code, acceptTerms? }` → tokens + user. `acceptTerms` required on sign-up or when the Terms change |
| POST | `/auth/refresh` | public | `{ refreshToken }` → new token pair (rotation) |
| POST | `/auth/logout` | public | `{ refreshToken }` |
| GET/PATCH | `/me` | signed in | Profile (name, email, default area) |
| GET | `/catalog/trades`, `/catalog/areas` | public | |
| GET | `/admin/users` | ADMIN | `?role=&q=&take=&cursor=` |
| PATCH | `/admin/users/:id/roles` | ADMIN | `{ roles, reason }` — audited |
| PATCH | `/admin/users/:id/status` | ADMIN | `{ status: ACTIVE\|SUSPENDED, reason }` — audited; suspension revokes sessions |
| GET | `/admin/audit-logs` | ADMIN | `?entityType=&entityId=&actorId=` |
| GET | `/health` | public | DB connectivity |

### Auth design

- **OTP**: 6 digits, stored only as `HMAC-SHA256(pepper, phone:code)`. Valid 5 min, 5 attempts (counted atomically, so parallel guesses can't exceed it), 60 s resend cooldown, 5 codes per phone and 20 per IP per hour. A new code replaces the previous one. Sent through Termii on the DND channel so it reaches DND-registered numbers.
- **Sessions**: 15-min HS256 access JWT + 30-day opaque refresh token, stored hashed. Each refresh rotates the token; re-using a rotated token revokes the whole token family and writes an audit entry.
- **RBAC**: a global guard denies every route unless it declares `@Public()`, `@Authenticated()` or `@Roles(...)`, and a test fails if any route lacks one. Roles and status come from the database on every request, so suspensions and role changes take effect immediately.
- **Dual roles**: `roles` is an array. Every user starts as `CLIENT`; artisans also hold `ARTISAN` and switch modes in the app.
- **Web**: the Next.js server proxies login and keeps tokens in `httpOnly`, `SameSite=Lax` cookies (page JavaScript can't read them). Proxied POSTs are origin-checked. Middleware refreshes expired access tokens.
- **Mobile**: tokens live in the OS keystore (`expo-secure-store`). Parallel 401s share a single refresh.

### Data integrity (enforced in Postgres, not only in code)

Migration `*_integrity` adds:
- CHECK constraints: money ≥ 0; quote totals add up; labour covers commission; ratings 1–5; canonical +234 phones; a decided verification check must have a reviewer.
- **Append-only** triggers on `ledger_entries`, `audit_logs` and `job_status_events`: UPDATE, DELETE and TRUNCATE all fail.
- Partial unique indexes: one active assignment, one live quote, one open dispute and one live payment per job.
- `job_ref_seq` for `JK-1001`-style references.

## Business rules decided so far

- Commission: **15% of the whole quote** (labour + materials), snapshotted on each quote (`commissionBps`).
- Paystack charge **and** transfer fees are absorbed by Jiko and recorded under `PAYSTACK_FEES` in the ledger.
- **Materials advance**: when the artisan starts the job on site (with a before-photo), the materials portion is released to them. Labour and commission stay in escrow until completion. The advance is non-refundable by default; an admin override refunds it from Jiko's funds (`PLATFORM_LOSSES`). Because all commission comes out of what remains in escrow, a quote's labour must be ≥ the commission on the whole quote. This is enforced in `splitQuote()` and by a DB CHECK.
- `Payment.refundedKobo` / `releasedKobo` are caches of ledger-derived values, written in the same transaction as the ledger rows (tested in Phase 3).
- Masking: phone numbers are hidden from the other party until the job is paid. Pre-payment chat messages containing contact details are masked and flagged for admins.
- Artisan offers expire after 2 working hours (07:00–20:00 WAT). Offers made outside that window expire at 09:00 the next day.

## Deploy (outline; finalised in Phase 6)

- **API → Railway or Render**: build `pnpm install --frozen-lockfile && pnpm --filter @jiko/api... build`; release `pnpm --filter @jiko/api db:deploy`; start `node apps/api/dist/main.js`. Set `TRUST_PROXY=true`, `SMS_PROVIDER=termii`, and generate fresh secrets. Use the platform's managed Postgres and Redis.
- **Web → Vercel**: root directory `apps/web`; set `API_URL`.
- **Mobile → EAS Build**: set `EXPO_PUBLIC_API_URL` per build profile.

See [docs/data-protection.md](docs/data-protection.md) for how personal data is handled under the NDPA.
