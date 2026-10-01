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

## Phase 3 · rules and review

- **Asked:** five rules as pure functions with Jest tests, flags generated on import, a per-viewer review queue with filters, a flag detail page with approve/dismiss, viewer-scoped decisions and audit entries, and `npm run score`.
- **Notes:**
  - The first fan-out rule flagged 3,295 transactions at 3% precision. Looking at the noisiest senders showed hub accounts paying the same payees repeatedly, so fan-out now also requires 80% distinct payees in the window (precision 51%). The same change broke fan-in recall (92% to 10%), so it is fan-out only. Both runs are in the README.
  - One new test (a "hub" account) failed at first because the test data put five distinct payees first, which is a genuine burst. The test data was wrong, not the rule.
  - The two-browser check at first seemed to show decisions not saving. The test client (Python's cookie jar) refused to send the `Secure` guest cookie over `http://localhost`, so every request was a new guest. Browsers treat localhost as secure, so the app was fine.
  - `next start` locally needs `AUTH_TRUST_HOST=true`, or Auth.js rejects the host.
  - Count chips use raw SQL (`lib/review.ts`); Prisma stores timestamps as UTC without a time zone, so "today" compares against `date_trunc('day', now() AT TIME ZONE 'UTC')`.

## Phase 4 · LLM explanations

- **Asked:** an OpenAI-compatible client with masking, an 8 s timeout and a template fallback (tested with a mock), Ollama or a hosted endpoint or `none` via env vars, lazy generation cached on the flag, `npm run explain:all`, and an "AI-generated / Template" tag.
- **Notes:**
  - Ollama was not installed on the build machine, so the LLM path was checked end to end against a small OpenAI-compatible mock server: pages showed "AI-generated", re-opening a flag made no second call, and a search of every request for all full account numbers in `demo.csv` found none. Against a mock that took 12 s, the page's first byte arrived in 0.1 s and the explanation fell back to the template at 8.1 s. A real Ollama run is still to do.
  - The first masking check found no account values at all, which proved nothing: the prompt is JSON inside JSON, so the regex missed the escaped quotes. The check now parses the request bodies.
  - `next build` type-checks the tests too; a `{...} as NodeJS.ProcessEnv` cast failed there because Next's types make `NODE_ENV` required, so `llmConfig` now takes a plain string map.
  - A template replaces the LLM text only when the LLM fails; cached text is written with a conditional update so two first opens of the same flag can't overwrite each other.
