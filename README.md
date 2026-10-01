# Flagline

Review rule-flagged transactions from a synthetic AML dataset. Rules flag suspicious
transactions, an LLM explains each flag in plain English, and any visitor, with no login,
approves or dismisses it. Every decision goes into an audit log.

> Portfolio project, not production compliance software. All data is synthetic.

**Status:** Phase 2 (auth and upload) of [PLAN.md](PLAN.md).

## Stack

Next.js (App Router) · React · TypeScript · Tailwind + shadcn/ui · PostgreSQL · Prisma · Zod ·
Docker · GitHub Actions · Vercel + Neon.

## Run locally

Requires Node 22 and Docker.

```bash
cp .env.example .env
docker compose up -d        # Postgres on localhost:5432
npm install                 # also runs prisma generate
npx prisma migrate dev      # create the tables
npm run seed                # import data/demo.csv (skips if already imported; --force to redo)
npm run dev                 # http://localhost:3000
```

`GET /api/health` reports whether the app can reach the database.

Checks: `npm run check` (lint, type check, Jest), plus `npm run format:check` and `npm run build`.

Integration tests need a throwaway database whose name ends in `_test`:

```bash
docker compose exec db psql -U flagline -c "CREATE DATABASE flagline_test"
DATABASE_URL=postgresql://flagline:flagline@localhost:5432/flagline_test DIRECT_URL=postgresql://flagline:flagline@localhost:5432/flagline_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://flagline:flagline@localhost:5432/flagline_test npm test
```

End to end: `npm run build`, then `npm run e2e` (Playwright; needs the seeded database and
`npx playwright install chromium` once).

`npm run score` prints precision and recall per rule and per typology (see below).

### Admin sign-in (optional)

Visitors never sign in: each browser gets a guest session cookie on its first visit. Only the
admin signs in, with GitHub, to upload CSVs. Without the three `AUTH_*` variables below the app
still runs as a guest-only demo: the "Admin sign-in" link is hidden and `/uploads` answers 403
(load data with `npm run seed` instead). To enable sign-in, fill these in `.env`:

- `AUTH_SECRET`: run `npx auth secret`, or use any random 32-byte base64 string.
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: from a GitHub OAuth app (GitHub → Settings →
  Developer settings → OAuth Apps) with callback URL
  `http://localhost:3000/api/auth/callback/github`.
- `ADMIN_GITHUB_USERNAMES`: your GitHub username. Anyone else who signs in stays a guest.

Admin users are matched on GitHub's numeric account id, never on the username, so a renamed
or re-registered username can't take over an existing admin row. The upload page's sample file
is served by the app at `/sample.csv`.

## Rules and how well they work

Five rules flag transactions, all comparing USD amounts. Thresholds live in
[lib/rules/config.ts](lib/rules/config.ts).

| Rule         | Fires when                                                                                                                        | Severity |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Fan-out      | One account pays 5+ distinct accounts within 14 days, with at least 80% of its payments in that window going to distinct accounts | High     |
| Fan-in       | One account receives from 5+ distinct accounts within 14 days                                                                     | High     |
| Pass-through | An account receives money and sends a similar amount (within 10%) onward within 72 hours                                          | Medium   |
| Large amount | USD amount above the upload's 99th percentile                                                                                     | Medium   |
| Duplicate    | Same payer, payee and amount within 60 minutes                                                                                    | Low      |

Self-transfers (an account paying itself, "Reinvestment" in the IBM data) are ignored by every
rule.

Results on `data/demo.csv`, from `npm run score`. This is a **sample** chosen to contain 40
laundering attempts, so 2.6% of it is laundering, far more than in the full dataset; precision
on real traffic would be lower.

| Rule         | Flagged | Laundering | Precision | Recall |
| ------------ | ------- | ---------- | --------- | ------ |
| Fan-out      | 141     | 72         | 51.1%     | 13.8%  |
| Fan-in       | 1286    | 229        | 17.8%     | 43.9%  |
| Pass-through | 674     | 151        | 22.4%     | 28.9%  |
| Large amount | 179     | 6          | 3.4%      | 1.1%   |
| Duplicate    | 7       | 0          | 0.0%      | 0.0%   |
| **Any rule** | 2195    | 379        | 17.3%     | 72.6%  |

| Typology       | Laundering txns | Recall (any rule) |
| -------------- | --------------- | ----------------- |
| FAN-IN         | 62              | 95.2%             |
| SCATTER-GATHER | 104             | 89.4%             |
| FAN-OUT        | 32              | 78.1%             |
| GATHER-SCATTER | 110             | 77.3%             |
| RANDOM         | 35              | 74.3%             |
| CYCLE          | 65              | 69.2%             |
| STACK          | 58              | 53.4%             |
| BIPARTITE      | 47              | 29.8%             |

**Tuning.** The first version of fan-out flagged 3,295 transactions at 3% precision, mostly
from hub accounts paying the same payees again and again. Requiring 80% of a window's payments
to go to distinct accounts raised fan-out precision to 51% (recall 20% → 14%) and overall
precision from 7.6% to 17.3% at nearly the same recall. The same condition cut fan-in's recall
on FAN-IN attempts from 92% to 10%, since senders repeat there, so fan-in does not use it.

**Limits.** Precision is low by design: rules are cheap to run and easy to explain, and every
flag goes to a human reviewer. Single-account rules see little of BIPARTITE patterns. The
fan-out rule catches only 22% of FAN-OUT rows because most of those rows are downstream hops
where each sender makes one or two payments. Large amount and duplicate add little on this
data. Amounts are converted with fixed, approximate FX rates.

## LLM explanations

Rules decide what gets flagged; an LLM only writes a one- or two-sentence reason for a flag
that already exists, so a wrong answer costs a bad sentence, not a missed flag.

- **Input:** the rule, its evidence and the transaction's structured fields, with every account
  number masked (`****F54E0`). No free text from the upload ever reaches the model, and its
  output is display-only.
- **Model:** any OpenAI-compatible endpoint serving an open-weight model: Ollama locally
  (`LLM_PROVIDER=ollama`, `LLM_MODEL=qwen2.5:3b`, no key), or a free hosted endpoint such as
  Groq or OpenRouter (`LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_MODEL`,
  `LLM_API_KEY`). `LLM_PROVIDER=none` uses templates only.
- **Fallback:** if the call fails or takes over 8 seconds, a fixed template per rule is used.
  The flag page tags every explanation "AI-generated" or "Template".
- **Caching:** each flag's explanation is generated on first open and stored on the flag, so
  it costs one call in total however many visitors open it. `npm run explain:all`
  pre-generates every explanation (`-- --retry-templates` upgrades template text once an LLM is
  available; `-- --delay 500` paces calls for rate-limited free tiers).

## Reviewing

Every visitor gets their own queue: a flag is open until _they_ approve or dismiss it, and one
visitor's decisions never change another's. A real bank would keep one shared status per flag;
per-visitor decisions keep the public demo usable by everyone at once. Dismissing requires a
note. Every decision goes into an append-only audit log, where visitors see only their own
entries.

## Security

Each protection, where it lives, and what tests it.

| Risk                                          | Protection                                                                                                                                                                                                                                  | Code                                                                                                                | Test                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A guest runs admin actions                    | Every admin page and endpoint calls `getAdmin()` on the server, which re-checks the role and the allow list; guests get HTTP 403                                                                                                            | [lib/authz.ts](lib/authz.ts), [app/api/uploads](app/api/uploads), [app/uploads/page.tsx](app/uploads/page.tsx)      | [uploads-auth](tests/api/uploads-auth.test.ts), [uploads-and-cleanup](tests/integration/uploads-and-cleanup.test.ts)                                                         |
| One guest sees or changes another's decisions | Every decision query filters by the session id from the httpOnly cookie, never from request input                                                                                                                                           | [lib/viewer.ts](lib/viewer.ts), [lib/review.ts](lib/review.ts), [app/flags/actions.ts](app/flags/actions.ts)        | [decisions](tests/integration/decisions.test.ts) (incl. a smuggled `guestSessionId`), [e2e](e2e/guest-flow.spec.ts)                                                          |
| Bots creating sessions or spamming decisions  | Postgres-backed rate limits per IP (30 new sessions / 10 min, 60 decisions / min); guest data deleted after 7 idle days by a cron route that requires `CRON_SECRET`                                                                         | [lib/rate-limit.ts](lib/rate-limit.ts), [proxy.ts](proxy.ts), [app/api/cron/cleanup](app/api/cron/cleanup/route.ts) | [uploads-and-cleanup](tests/integration/uploads-and-cleanup.test.ts), [decisions](tests/integration/decisions.test.ts)                                                       |
| The wrong person gets admin                   | GitHub login grants admin only to `ADMIN_GITHUB_USERNAMES`, matched on GitHub's numeric account id (a reused username can't inherit an admin row); removal takes effect on the next request; without the `AUTH_*` variables nobody is admin | [lib/auth.ts](lib/auth.ts), [lib/admin-list.ts](lib/admin-list.ts), [lib/auth-config.ts](lib/auth-config.ts)        | [admin-list](tests/auth/admin-list.test.ts), [auth-disabled](tests/auth/auth-disabled.test.ts), [users](tests/integration/users.test.ts), [no-auth e2e](e2e/no-auth.spec.ts) |
| Bad or malicious CSV                          | 5 MB limit (checked before buffering), 50,000-row limit, a Zod schema per row, and the whole file rejected on any error                                                                                                                     | [lib/uploads](lib/uploads)                                                                                          | [validate](tests/uploads/validate.test.ts), [uploads-and-cleanup](tests/integration/uploads-and-cleanup.test.ts)                                                             |
| CSV formula injection on export               | Not applicable: there is no export yet (stretch goal). Amounts must match a strict number format, so `=1+1` is rejected on import                                                                                                           | [lib/uploads/validate.ts](lib/uploads/validate.ts)                                                                  | [uploads-and-cleanup](tests/integration/uploads-and-cleanup.test.ts)                                                                                                         |
| Leaking account numbers                       | Masked (`****F54E0`) in the UI and in everything sent to the LLM                                                                                                                                                                            | [lib/format.ts](lib/format.ts), [lib/llm/input.ts](lib/llm/input.ts)                                                | [explain](tests/llm/explain.test.ts)                                                                                                                                         |
| Prompt injection via CSV text                 | Only structured, masked fields reach the LLM; its output is plain text shown on the page and never triggers actions                                                                                                                         | [lib/llm](lib/llm)                                                                                                  | [explain](tests/llm/explain.test.ts)                                                                                                                                         |
| Tampering with history                        | The audit log has no update or delete path in code (a Postgres role without UPDATE/DELETE is a stretch goal)                                                                                                                                | every `auditLog.create` call                                                                                        | [audit-insert-only](tests/security/audit-insert-only.test.ts)                                                                                                                |
| Secrets in the repo                           | `.env*` is git-ignored; secrets live in GitHub and Vercel; `.env.example` has names only                                                                                                                                                    | [.gitignore](.gitignore), [.env.example](.env.example)                                                              | CI runs with throwaway values                                                                                                                                                |
| Vulnerable dependencies                       | Dependabot, plus `npm audit --omit=dev --audit-level=high` in CI                                                                                                                                                                            | [.github](.github)                                                                                                  | CI                                                                                                                                                                           |

**Tradeoff:** an open demo lets anyone create guest data. Rate limits, the 7-day cleanup and
per-session scoping keep that cheap and contained, and nothing a guest does changes shared data.

## Deploy (Vercel + Neon)

1. **Neon:** create a free project. Copy the **pooled** connection string (host contains
   `-pooler`) and the **direct** one.
2. **GitHub:** add repository secrets `DATABASE_URL` (pooled) and `DIRECT_URL` (direct). The
   [migrate workflow](.github/workflows/migrate.yml) runs `prisma migrate deploy` on every merge
   to `main`, and skips itself until both are set. Run it once by hand (Actions → Migrate
   production database → Run workflow) to create the tables.
3. **Vercel:** import the repository and set these environment variables: `DATABASE_URL`,
   `DIRECT_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` (a second GitHub OAuth
   app with callback `https://<your-domain>/api/auth/callback/github`),
   `ADMIN_GITHUB_USERNAMES`, `CRON_SECRET` (any long random string), and the `LLM_*` variables
   (or `LLM_PROVIDER=none`). Vercel deploys `main` to production and every pull request to a
   preview URL.
4. **Seed and pre-generate explanations** from your machine, against the production database:

   ```bash
   DATABASE_URL="<neon pooled url>" npm run seed
   DATABASE_URL="<neon pooled url>" LLM_PROVIDER=... LLM_BASE_URL=... LLM_MODEL=... LLM_API_KEY=...      npm run explain:all -- --delay 500
   ```

5. **Check:** `https://<your-domain>/api/health` should return `{"status":"ok","db":"ok"}`.
   The cleanup job is scheduled daily at 04:00 UTC by [vercel.json](vercel.json); Vercel sends
   `CRON_SECRET` with each call.

Migrations and the Vercel deploy run side by side on a merge, so a deploy can briefly run
ahead of a migration. Keep migrations additive (new tables and columns first, removals later).

## Data

See [data/README.md](data/README.md) for how `demo.csv` and `labels.csv` are sampled from the
IBM AML dataset with `scripts/sample_data.py`.

Data credit: Altman et al., "Realistic Synthetic Financial Transactions for Anti-Money
Laundering Models", NeurIPS 2023.

## License

MIT
