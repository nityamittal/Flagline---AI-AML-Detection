# AI notes

A running log of what I asked AI tools for and what I had to fix. See PLAN.md, "Using AI tools while building".

## Phase 1 · skeleton and data

- **Asked:** scaffold Next.js + TypeScript + Tailwind + shadcn/ui, Prisma schema for all seven tables, Docker Compose Postgres, `scripts/sample_data.py`, and CI (lint, type check, build).
- **Notes:**
  - The shadcn registry was unreachable from the build sandbox, so `components/ui/` (button, badge, card) and `components.json` were written by hand to match shadcn's new-york style. `npx shadcn add <component>` works normally on a regular machine.
  - Pinned Prisma 6: Prisma 7 moves `url`/`directUrl` out of `schema.prisma`, and PLAN.md's Neon setup uses `directUrl` in the schema.
  - `sample_data.py` was tested against a small synthetic file in the IBM format, since Kaggle downloads need a signed-in account.

## Phase 2 · auth and upload

- **Asked:** guest-session proxy, Auth.js GitHub login limited to `ADMIN_GITHUB_USERNAMES`, an admin-only `/uploads` page (5 MB limit, preview, Zod row errors, USD conversion, all-or-nothing import), `scripts/seed.ts`, audit entries for sign-in and upload, and Jest with a test that a guest gets 403.
- **Notes:**
  - Next 16 renamed `middleware.ts` to `proxy.ts`, and the proxy runs on the Node runtime by default, so it can create the `GuestSession` row with Prisma directly.
  - Uploads are route handlers (`POST /api/uploads`, `/api/uploads/preview`), not server actions, so a guest gets a real HTTP 403. The `/uploads` page uses `forbidden()`, which needs the experimental `authInterrupts` flag.
  - `demo.csv` has Bitcoin amounts with 6 decimals (e.g. `0.000039`), which the Phase 1 `amount Decimal(20, 2)` column would have rounded to `0.00`. A migration widens it to `Decimal(24, 8)`; `amountUsd` stays `Decimal(20, 2)`.
  - The first attempt to augment Auth.js's JWT type targeted `next-auth/jwt`, which only re-exports `@auth/core/jwt`, so TypeScript rejected it. The augmentation now targets `@auth/core/jwt`.
  - The guest cookie's value is the session id, so ids come from `crypto.randomUUID()` rather than the schema's cuid default.

### Phase 2 review fixes

- **Asked (review):** keep the app running without `AUTH_SECRET` or the GitHub OAuth variables; match sign-in on GitHub's account id rather than the username, with a non-numeric seed id; serve the sample CSV from the app; and have Dependabot skip `@types/node` majors.
- **Notes:**
  - Auth.js throws on every request without a secret, and the layout calls `getAdmin()` on every page, so a missing variable took down the whole app, guest pages included. `lib/auth-config.ts` now gates every Auth.js call; `getAdmin()` also fails closed if Auth.js throws.
  - Sign-in already upserted on `githubId`, but `githubLogin` was unique, so a renamed account whose old name someone else took would have failed to sign in. The login is no longer unique, and only a positive integer id is accepted from GitHub, so `seed:flagline` can't be claimed.
  - `/sample.csv` reads `data/demo.csv` at runtime; `outputFileTracingIncludes` ships the file with the route on Vercel.
  - The migration was written by hand (`prisma migrate diff`) rather than with `migrate dev`, because the local database already had later phases' migrations and `migrate dev` would have offered to reset it.
