# Transaction Review App: Build Plan

## Overview

Build a small full-stack web app (working name **Flagline**) in about two weeks. The admin loads a CSV of transactions from IBM's synthetic AML dataset, rules flag suspicious ones, an LLM writes a plain-English reason for each flag, and any visitor, with no login, approves or dismisses it. Every decision goes into an audit log.

**Motivation.** At American Express I maintained pipelines that fed the AML transaction monitoring team and helped triage data issues with them. That showed me detection is only half the job: people still have to review each flag, understand why it fired, and record what they decided. Flagline builds that second half.

**Goals**

- Show full-stack work in the stack McKinsey's SWE posting names: React, Next.js, TypeScript, Node.js, SQL, Docker, CI/CD, a cloud deploy.
- Show security basics and testing done on purpose, not by accident.
- Show an AI-assisted workflow and an AI feature, with honest limits.
- Stay small enough to finish, deploy, and explain in 10 minutes.

**Non-goals**

- No machine learning model. Rules are enough and easier to explain.
- No real bank data, and nothing from Amex beyond the general problem.
- No microservices, queues, or real-time streaming.
- Not production-grade compliance software. It is a portfolio project and the README says so.

## Data

Use the synthetic **IBM Transactions for Anti Money Laundering (AML)** dataset from Kaggle. Download only two files, `HI-Small_Trans.csv` and `HI-Small_Patterns.txt`, and sample about 20,000 rows **by account** so each laundering pattern stays whole.

**What the 17 files are**

| File | What it holds | Use it? |
| --- | --- | --- |
| `*_Trans.csv` | Every transaction, with an `Is Laundering` label (1 = laundering) | Yes, `HI-Small` only |
| `*_Patterns.txt` | Laundering attempts grouped by typology: FAN-OUT, FAN-IN, CYCLE, STACK, SCATTER-GATHER, GATHER-SCATTER, BIPARTITE, RANDOM | Yes, `HI-Small` only, for sampling and scoring by typology |
| `*_accounts.csv` | Account to bank and entity names | No |
| HI vs. LI prefix | HI has a higher share of laundering; LI has a lower one | HI, so a small sample still holds many patterns |
| Small / Medium / Large | The same kind of data at different sizes | Small is plenty |

**Column mapping** (headers as they appear in the files)

| IBM column | App column | Notes |
| --- | --- | --- |
| Timestamp | `timestamp` | Format `2022/08/09 05:14`; parse as UTC |
| From Bank + Account | `from_account` | Join as `bank-account` (e.g. `00952-8139F54E0`), since an account string can repeat across banks |
| To Bank + second Account column | `to_account` | pandas reads the duplicate header as `Account.1` |
| Amount Paid | `amount` | Decimal, in the payment currency |
| Payment Currency | `currency` | Many currencies: US Dollar, Euro, Yuan, Yen, Ruble, Rupee, UK Pound and more |
| Amount Received, Receiving Currency | dropped | Differ from the paid side only for cross-currency payments |
| Payment Format | `payment_type` | For example ACH |
| Is Laundering | `labels.csv` only | Never part of the upload |
| Row number | `external_id` | Stable id for joining flags to labels |

**How to prepare it**

1. Sign in to Kaggle, open the dataset's Data tab, and download the two files. Put them in `data/raw/`, which is in `.gitignore`.
2. Write `scripts/sample_data.py` (Python + pandas, run once locally):
   1. Parse `Patterns.txt`: each attempt sits between `BEGIN LAUNDERING ATTEMPT - <TYPE>` and `END LAUNDERING ATTEMPT`, one transaction per line in the same format as `Trans.csv`.
   2. Pick about 40 attempts, about 5 per typology.
   3. Keep every transaction in `Trans.csv` that touches an account from those attempts.
   4. Add every transaction of about 2,000 randomly chosen other accounts, stopping near 20,000 rows. Sort by time.
   5. Write `data/demo.csv` (no label), `data/labels.csv` (`external_id`, `is_laundering`, `typology`), and `data/fx_rates.json` (fixed, approximate USD rates per currency).
3. Commit only the three files in `data/` (a few MB).
4. Before committing `demo.csv` to a public repo, check the license on the dataset's Kaggle page, and credit the source in the README: Altman et al., "Realistic Synthetic Financial Transactions for Anti-Money Laundering Models", NeurIPS 2023.

**Why sample by account, not by date:** the patterns run over days to weeks (a fan-out can span a month), so a date window would cut them in half. **Tradeoff:** the sample has a much higher laundering rate than the full file. Report precision and recall on the sample and say it is a sample.

## Architecture and tech choices

One Next.js app in TypeScript serves both the UI and the API, backed by PostgreSQL. One codebase and one deploy keep the project finishable while still covering frontend, backend, database, and cloud.

```
                 +------------------- Next.js app (TypeScript) on Vercel -------------------+
 Browser  -----> |  React pages (UI)                                                        |
 (guest, admin)  |        |                                                                 |
                 |  Server actions + route handlers (Node.js)                               |
                 |        |                                                                 |
                 |  Guest session or admin role check, Zod validation  --Prisma-->  PostgreSQL (Neon)
                 |        |                         |                               uploads, flags, audit
                 |  Rules engine              LLM client  ----------------------->  LLM API
                 |  (pure functions)          (masking + fallback)                  (open-weight model)
                 +--------------------------------------------------------------------------+
                                          ^ deploys
            GitHub Actions: lint, test, migrate -> Vercel deploys main + previews
```

Every request passes the auth and validation layer before it reaches the database; the rules engine and LLM client are plain modules you can unit test.

| Layer | Choice | Why | Tradeoff |
| --- | --- | --- | --- |
| Frontend | Next.js (App Router), React, TypeScript | Named in the posting; server components keep data loading simple | App Router has a learning curve; plain React + Vite would be simpler but skips Next.js |
| Styling | Tailwind + shadcn/ui | Fast, consistent tables, dialogs, and badges without designing from scratch | Looks generic unless you adjust spacing and colors |
| Backend | Next.js route handlers and server actions (Node.js) | No second service to deploy; types shared with the UI | A separate Express API would show Node more explicitly; mention it as a deliberate choice |
| Validation | Zod | One schema validates CSV rows, API input, and form input | Small extra dependency |
| Database | PostgreSQL | Relational data (uploads, transactions, flags, decisions) with real joins and constraints | Needs a hosted instance; SQLite is easier locally but weaker to show |
| ORM | Prisma | Typed queries, migrations, and a readable schema file | Hides SQL; write at least one raw SQL query for the dashboard counts to show you know SQL |
| Auth | Guest sessions for visitors; Auth.js GitHub login for the admin only | No login wall for recruiters or engineers; admin actions stay protected | Guest data must be scoped per session, rate limited, and cleaned up |
| AI | Open-weight model through one OpenAI-compatible client: Ollama locally, a free hosted endpoint in the demo; cached per flag | Free and open source; env vars switch backends | Free tiers are rate limited and small models write plainer text; template fallback keeps the app working with no LLM |
| CSV parsing | Papa Parse, streamed on the server | Handles quoting and large files | Upload limit needed (see Security) |
| Tests | Jest (rules, validation) + Playwright (one end-to-end flow) | Jest is named in the posting; one E2E test proves the app works | E2E tests are slow and flaky if you write many; keep one or two |
| DevOps | Docker + GitHub Actions | Named in the posting; CI on every pull request | Docker adds setup time early |
| Hosting | Vercel + Neon Postgres | Live URL in hours, a preview deploy per pull request, free tiers | Less cloud depth than AWS; Docker is used for local dev and CI, not hosting |

**Request flow:** browser → Next.js page or server action → guest session or admin role check → Zod validation → Prisma → PostgreSQL. The rules engine and the LLM client are plain TypeScript modules under `lib/`, so they can be unit tested without the web framework.

**Folder layout**

```
app/            pages and route handlers
  api/          auth (admin GitHub login), health, cron
  uploads/      upload + upload detail
  flags/        queue + flag detail
  audit/
lib/
  rules/        one file per rule + index
  llm/          prompt, client, fallback
  db.ts         Prisma client
  auth.ts
prisma/schema.prisma
tests/          Jest unit tests
e2e/            Playwright
scripts/        sample_data.py, seed.ts, score.ts, explain-all.ts
```

## Data model

Seven tables are enough: admin users, guest sessions, uploads, transactions, flags, decisions, and an append-only audit log.

| Table | Key columns | Notes |
| --- | --- | --- |
| `User` | id, githubId, githubLogin, role (`ADMIN`) | Only you sign in; created on first GitHub login when your username is in `ADMIN_GITHUB_USERNAMES` |
| `GuestSession` | id, createdAt, lastSeenAt | One per visitor, id kept in an httpOnly cookie; deleted after 7 days without activity |
| `Upload` | id, fileName, uploadedById, rowCount, status (`PROCESSING`, `DONE`, `FAILED`), createdAt | One row per CSV |
| `Transaction` | id, uploadId, externalId, timestamp, fromAccount, toAccount, amount (decimal), currency, amountUsd (decimal), paymentType | Unique on (uploadId, externalId); money as `Decimal`, never float |
| `Flag` | id, transactionId, ruleId, severity (`LOW`, `MEDIUM`, `HIGH`), details (JSON), explanation, explanationSource (`LLM` or `TEMPLATE`) | Shared by all visitors; no status column, because status is per viewer |
| `Decision` | id, flagId, userId or guestSessionId, outcome (`APPROVED`, `DISMISSED`), note, createdAt | One per flag per viewer; a flag is open for a viewer until they decide it |
| `AuditLog` | id, actorType (`ADMIN` or `GUEST`), actorId, action, entityType, entityId, metadata (JSON), createdAt | Insert-only; no update or delete path in code |

**Why these choices**

- **`details` as JSON on `Flag`:** each rule stores different evidence (the recipient list, the matching onward payment). JSON avoids a table per rule. Tradeoff: harder to query, which is fine because you only display it.
- **Decisions per viewer:** every visitor gets a fresh queue, and one visitor's clicks never change another's. Tradeoff: the queue query is "flags with no decision by me", a join instead of a status filter, and a real bank would have one shared status. Say so in the README.
- **`amountUsd` stored at import:** amounts come in many currencies, so import converts once with `fx_rates.json` and every rule compares USD.
- **Store `explanationSource`:** the UI shows whether the text came from the LLM or the fallback template.
- **Indexes:** `Decision(guestSessionId, flagId)` and `Decision(userId, flagId)` for the queue, `Flag(severity, ruleId)` for filters, `Transaction(uploadId, fromAccount, timestamp)` and `Transaction(uploadId, toAccount, timestamp)` for fan-out and fan-in, `AuditLog(createdAt)` for the log page.

## Flagging rules and LLM explanations

Rules decide what gets flagged, and the LLM only explains a flag that already exists. That split keeps detection testable and makes a wrong LLM answer cost a bad sentence, not a missed flag.

**Rules (five core rules, one stretch), aimed at the IBM typologies**

| Rule | Fires when | Severity | Aimed at | Evidence stored |
| --- | --- | --- | --- | --- |
| Fan-out | One account pays 5+ distinct accounts within 14 days | High | FAN-OUT, SCATTER-GATHER, GATHER-SCATTER | recipient count, transaction ids |
| Fan-in | One account receives from 5+ distinct accounts within 14 days | High | FAN-IN, GATHER-SCATTER, SCATTER-GATHER | sender count, transaction ids |
| Pass-through | An account receives money and sends a similar amount (within 10% in USD) onward within 3 days | Medium | STACK, CYCLE, RANDOM chains | both transaction ids, hours between |
| Large amount | USD amount above the 99th percentile for the upload | Medium | Extreme outliers in any typology | amountUsd, threshold |
| Duplicate | Same from, to, and amount within 1 hour | Low | Repeated payments, data issues | duplicate's id |
| Round-trip (stretch) | A pays B and B pays A within 30 days | Medium | 2-hop CYCLE | both transaction ids |

**Currencies:** amounts arrive in many currencies, so import converts each to USD with `data/fx_rates.json` (fixed, approximate rates, labeled as such) and every rule compares `amountUsd`. **Coverage:** BIPARTITE and RANDOM patterns are hard for single-account rules; expect low recall there and say so.

Thresholds are your own starting guesses, kept in one config file. Tune them against `labels.csv` and write down what changed.

**Rule interface**

```ts
type Rule = {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  evaluate(txns: Transaction[]): RuleHit[];
};
```

Each rule is a pure function over one upload's transactions. Pure functions are easy to unit test with small hand-made arrays.

**Measuring the rules**

A script joins flags to `labels.csv` and prints precision and recall per rule and per typology. Put the table in the README. Expect low precision; the point is to be honest about it and explain why a human review step exists.

**LLM explanation**

- **Model (free and open source):** an open-weight instruct model, such as a small Llama or Qwen model, behind one OpenAI-compatible client in `lib/llm/`. Locally it runs on Ollama (free, no key, `LLM_BASE_URL=http://localhost:11434/v1`). The deployed demo points the same client at a free hosted endpoint for open-weight models (for example Groq or OpenRouter's free models). `LLM_PROVIDER=none` turns the LLM off.
- **Input:** rule id, the evidence JSON, and the flagged transaction with account numbers masked (`****F54E0`). Structured fields only, never free text.
- **Prompt:** "Explain in one or two plain sentences why this transaction was flagged by this rule. Use only the facts given. Do not say the transaction is fraud."
- **Output:** stored on the flag. Flags are shared, so each flag costs one call in total, however many visitors open it.
- **Fallback:** if the call fails or takes over 8 s, use a template string per rule and mark `explanationSource = TEMPLATE`.
- **When:** lazily on first open, plus `npm run explain:all` to pre-generate every flag after seeding. Pre-generating means demo visitors never wait on the LLM or hit a free-tier rate limit.

**Tradeoffs**

- Rules vs. an ML model: rules are explainable and testable but miss subtle patterns. An ML model needs a lot of evaluation work and is harder to justify in an interview.
- LLM vs. templates only: templates are free and exact but read robotic. The LLM reads well but can overstate; the prompt, masking, and label in the UI limit that.

## UX

The app has five screens built around one job: get a reviewer from an open flag to a recorded decision in a few seconds. Everything else supports that loop.

**Layout:** a left sidebar (Review queue, Audit log, and Uploads for the admin only) and a main content area. A thin banner at the top reads "Demo mode: synthetic IBM AML data. Your decisions are only visible to you." The footer holds "Admin sign-in", the GitHub repo link, and the data credit. Desktop first; tables collapse to cards on a phone.

**No login wall.** Recruiters and engineers open the link and are reviewing within seconds. Only you ever sign in.

**1. First visit (no login)**

- Opening the link goes straight to the review queue. The server creates a guest session and sets an httpOnly cookie; the visitor is asked for nothing.
- A dismissible card explains the app in two lines and suggests "Open the first high-severity flag".
- "Admin sign-in" in the footer starts GitHub login. It grants admin only to usernames on the allow list; anyone else stays a guest and sees a note saying so.

**2. Uploads (admin)**

- A drop zone: "Drop a CSV or click to choose. Max 5 MB." with a link to download the sample file and a list of the required columns.
- After dropping: a preview of the first 10 rows and any validation errors ("Row 214: amount is not a number"). Buttons: **Import** and **Cancel**.
- While importing: a progress state, then a summary card: "12,480 transactions imported, 312 flagged (41 high)." with a button **Go to review queue**.
- Below: a table of past uploads (file, date, rows, flags, status).

**3. Review queue**

- A table: severity badge, rule, amount, from → to (masked), time, status.
- Filters at the top: status (Open by default), severity, rule, upload. Sort by severity, then time.
- Count chips: "Open 312 · High 41 · Reviewed today 18".
- Clicking a row opens the flag detail.

**4. Flag detail (the core screen)**

- Top: severity badge, rule name, and the explanation in a callout. A small tag says "AI-generated" or "Template".
- Middle: the transaction fields, and a "Related transactions" table from the evidence (the other transfers in the fan-out, or the matching onward payment).
- Right or bottom panel: **Approve flag** (escalate), **Dismiss**, and a note box. Dismiss requires a short note.
- History: earlier decisions on this flag.
- Keyboard shortcuts: `A` approve, `D` dismiss, `J`/`K` next and previous flag. After a decision the next open flag loads, so a reviewer can work through the queue without going back to the list.

**5. Audit log**

- A read-only table: time, actor (your GitHub username, or "You" for the visitor's own actions), action ("Dismissed flag 1042"), and a link to the item.
- Visitors see only their own entries; the admin sees everything. No edit or delete buttons anywhere, which is itself the point.

**States to design on purpose**

| State | What the user sees |
| --- | --- |
| Empty queue | "You've reviewed every flag." with a Reset my decisions button |
| Explanation loading | A skeleton line where the explanation will appear; the rest of the page is usable |
| LLM failed | The template explanation with the "Template" tag, no error shown |
| Bad CSV | Row-level errors listed before import; nothing is saved |
| Guest opens an admin page | A clear "You don't have access to uploads" message, not a blank page |

**UX tradeoffs**

- Auto-advancing to the next flag is fast but can feel abrupt. Show a short toast ("Dismissed. Next flag.") with **Undo** for 5 seconds.
- Requiring a note on dismiss slows reviewers down but makes the audit log useful. Keep it required for dismiss only.

## Security

Pick a short list of protections, do each one properly, and write each one down in the README with a sentence of why. That gives you a concrete answer to the posting's "security mindset" line.

| Risk | Protection | Where |
| --- | --- | --- |
| A guest runs admin actions (upload, settings) | Server-side role check in every admin action and route; a guest calling the endpoint directly gets 403 | `lib/auth.ts`, each server action |
| One guest sees or changes another's decisions | Every decision query filters by the session id from the httpOnly cookie, never from request input | Decision queries |
| Bots creating sessions or spamming decisions | Rate limit per IP on session creation and on decisions; guest data deleted after 7 days | Middleware, cleanup cron |
| The wrong person gets admin | GitHub login grants admin only to usernames in `ADMIN_GITHUB_USERNAMES` | Auth.js sign-in callback |
| Bad or malicious CSV | Size limit (5 MB), row limit, Zod schema per row, reject the whole file on errors | Upload route |
| CSV formula injection when exported | Prefix cells starting with `=`, `+`, `-`, `@` if you add export | Export helper (stretch) |
| Leaking account numbers | Mask in the UI and in LLM prompts (synthetic data, but practice the habit) | Formatting helper, LLM client |
| Prompt injection via CSV text | Send only structured fields to the LLM; its output is display-only and cannot trigger actions | LLM client |
| Tampering with history | Audit log is insert-only in code; a Postgres role without UPDATE/DELETE on that table (stretch) | Prisma layer, DB grants |
| Secrets in the repo | `.env` in `.gitignore`, secrets in GitHub Actions and Vercel; `.env.example` checked in | Repo, CI |
| Vulnerable dependencies | Dependabot plus `npm audit` in CI | GitHub |

**Tradeoff:** an open demo lets anyone create guest data. Rate limits, the 7-day cleanup, and per-session scoping keep that cheap and contained, and nothing a guest does changes shared data.

## Testing and CI/CD

Test the logic heavily and the UI lightly: most tests are fast Jest tests on rules and validation, plus one or two Playwright tests of the main flow.

**What to test**

| Level | Tool | Tests |
| --- | --- | --- |
| Unit | Jest | Each rule: fires on a hand-made positive case, stays quiet on a negative case, handles edge cases (exactly at threshold, empty input) |
| Unit | Jest | CSV row schema: good row passes, missing column fails, bad number fails |
| Unit | Jest | Masking helper; LLM client falls back to the template when the API throws (mock the API) |
| Integration | Jest + a test Postgres (Docker) | Upload service saves transactions and flags for a small CSV |
| Integration | Jest | Guest calling an admin action gets 403; guest A cannot read guest B's decisions |
| End to end | Playwright | Guest opens the app → opens a flag → dismisses with a note → sees it in the audit log; a second browser still sees the flag as open |

Aim for around 25–40 tests. The count matters less than covering every rule and every permission check.

**CI (GitHub Actions, on every pull request)**

1. Install with `npm ci` (cached).
2. Lint (ESLint) and type check (`tsc --noEmit`).
3. Jest unit and integration tests, with Postgres as a service container.
4. Build the Next.js app.
5. Build the Docker image.
6. Playwright E2E against the built app (can run only on `main` if it is slow).

**CD (on merge to `main`)**

Vercel deploys `main` to production and every pull request to its own preview URL. A GitHub Actions job runs `prisma migrate deploy` against Neon on merge to `main`. Connection strings live in GitHub and Vercel secrets, never in the repo.

**Tradeoff:** running E2E on every PR catches more but slows CI to several minutes. Start with E2E on `main` only, and move it to PRs once it is stable.

**Branch habits:** small PRs with descriptions, even though you work alone. The PR history then shows how you worked with AI tools and what you reviewed.

## Deployment

Deploy the Next.js app on Vercel with a Neon Postgres database. Both have free tiers and take hours, not days, so the two weeks go into the app rather than cloud setup.

| Option | Setup time | Cost | Shows |
| --- | --- | --- | --- |
| Vercel + Neon (chosen) | A few hours | Free tiers | Next.js deploy, preview environments, managed Postgres |
| AWS App Runner + RDS | 1–2 days the first time | Low but not zero | More AWS depth (IAM, ECR, networking) |

**Steps (Vercel + Neon)**

1. Create a Neon project and database on the free tier. Copy two connection strings: the **pooled** one (its host contains `-pooler`) and the **direct** one.
2. In `prisma/schema.prisma`, set `url = env("DATABASE_URL")` to the pooled string and `directUrl = env("DIRECT_URL")` to the direct one. The app uses the pool; migrations use the direct connection.
3. Import the GitHub repo into Vercel. Add the environment variables from the Build brief.
4. Run `prisma migrate deploy` from GitHub Actions on merge to `main`.
5. Optional: install the Neon integration in Vercel so each pull request's preview deploy gets its own database branch.
6. Add `/api/health` and check it after each deploy.

**Tradeoff:** you give up AWS depth (IAM, container hosting, networking). Docker still earns its place for local Postgres and CI, and the app can move to AWS later without code changes.

**Demo data:** seed production with the sample upload, then run `npm run explain:all` so every flag already has its explanation and visitors never wait on the LLM. A daily Vercel Cron job deletes guest sessions and their decisions after 7 days without activity.

## Build brief

Every open decision is settled here. A coding session reads this section first, then builds one phase of the Execution plan at a time and stops at that phase's "Done when".

| Topic | Decision |
| --- | --- |
| Audience | Recruiters and engineers viewing a public demo |
| Visitors | No login. A guest session cookie; decisions are per visitor; guest data deleted after 7 days |
| Admin | You only, via Auth.js GitHub login, allow list in `ADMIN_GITHUB_USERNAMES`; only the admin uploads |
| Data | `HI-Small_Trans.csv` + `HI-Small_Patterns.txt` from the IBM AML Kaggle dataset, sampled by account to about 20,000 rows |
| Detection | Five rules plus one stretch rule over USD amounts; no ML model |
| LLM | Open-weight model via an OpenAI-compatible client: Ollama locally, a free hosted endpoint in the demo, `none` for templates only |
| Hosting | Vercel Hobby + Neon Free |
| License | MIT, public repo |

**Environment variables** (commit `.env.example` with these names and no values)

| Variable | What it is | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Pooled Postgres connection (locally: the Docker Postgres URL) | Neon dashboard, pooled connection string |
| `DIRECT_URL` | Direct Postgres connection, used by migrations | Neon dashboard, direct connection string |
| `AUTH_SECRET` | Signs session cookies | Run `npx auth secret` |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | GitHub OAuth app for admin sign-in | GitHub Settings → Developer settings → OAuth Apps; callback URL `https://<your-domain>/api/auth/callback/github` (a second app for localhost) |
| `ADMIN_GITHUB_USERNAMES` | Comma-separated GitHub usernames that get admin | Your username |
| `LLM_PROVIDER` | `ollama`, `openai-compatible`, or `none` | Your choice |
| `LLM_BASE_URL` | Endpoint URL, e.g. `http://localhost:11434/v1` for Ollama | Provider docs |
| `LLM_MODEL` | Model name at that endpoint | Provider's model list |
| `LLM_API_KEY` | Empty for Ollama; the key for a hosted endpoint | Provider dashboard |
| `GUEST_SESSION_TTL_DAYS` | Days before guest data is deleted (default 7) | Your choice |
| `CRON_SECRET` | Protects the cleanup cron route | Any long random string |

**First instruction to a coding session:** "Read PLAN.md. Build Phase 1 only. Stop when its Done when checks pass, and summarize what you did and anything you were unsure about."

## Execution plan

Two weeks part-time (about 2–3 hours a day) gets a deployed, tested app. Each phase ends with something working, so a slip cuts polish, not the core.

**Phase 1 · Days 1–2: skeleton and data**

- [ ] Public repo with MIT license; Next.js + TypeScript + Tailwind + shadcn/ui, ESLint, Prettier
- [ ] Docker Compose with Postgres; Prisma schema for all seven tables; first migration
- [ ] Download the two HI-Small files and run `scripts/sample_data.py` to produce `demo.csv`, `labels.csv`, and `fx_rates.json`
- [ ] GitHub Actions: lint, type check, build

**Done when:** `docker compose up -d` then `npm run dev` shows a placeholder page, `npx prisma migrate dev` succeeds, the three data files are committed, and CI is green on a pull request.

**Phase 2 · Days 3–4: auth and upload**

- [ ] Guest session middleware (httpOnly cookie, `GuestSession` row)
- [ ] Auth.js GitHub login restricted to the admin allow list
- [ ] Upload page (admin only): drop zone, preview, Zod row validation, USD conversion, import into Postgres
- [ ] Seed script that imports `data/demo.csv`
- [ ] Audit log writes for admin sign-in and upload

**Done when:** a fresh browser gets a guest cookie without any prompt, the admin can sign in and import `demo.csv`, and a test shows a guest calling the upload action gets 403.

**Phase 3 · Days 5–7: rules and review**

- [ ] Five rules as pure functions over `amountUsd`, with Jest tests for each
- [ ] Run rules after import and save flags
- [ ] Review queue (open = no decision by this viewer) with filters; flag detail with approve/dismiss and notes
- [ ] Decisions and audit entries scoped to the viewer's session
- [ ] `npm run score` prints precision and recall per rule and per typology

**Done when:** importing the sample produces flags, two different browsers review independently, every rule has passing positive and negative tests, and the scoring script prints its table.

**Phase 4 · Days 8–9: LLM explanations**

- [ ] OpenAI-compatible LLM client with masking, 8 s timeout, and template fallback (tested with a mock)
- [ ] Ollama locally; env vars switch to a hosted free endpoint or to `none`
- [ ] Lazy generation on first open, cached on the flag; `npm run explain:all` to pre-generate; "AI-generated / Template" tag

**Done when:** with `LLM_PROVIDER=none` the app works with template text, and with Ollama running a flag shows an explanation tagged AI-generated.

**Phase 5 · Days 10–11: security and tests**

- [ ] Rate limits on guest session creation and decisions; upload limits
- [ ] Integration tests: guest gets 403 on admin actions; guest A cannot read guest B's decisions
- [ ] One Playwright test of the guest flow; all tests in CI

**Done when:** CI runs lint, type check, Jest, and Playwright and is green, and every row of the Security table points to code or a test.

**Phase 6 · Days 12–13: deploy**

- [ ] Neon database, pooled and direct URLs, Prisma `directUrl`
- [ ] Vercel project and env vars, migrations in CI, preview deploys, health check
- [ ] Seed production, run `npm run explain:all`, add the daily guest-cleanup cron

**Done when:** the Vercel URL opens straight into a seeded queue with ready explanations, a merge to `main` deploys automatically, and the cleanup cron is scheduled.

**Phase 7 · Day 14: polish and write-up**

- [ ] Empty, loading, and error states; keyboard shortcuts; undo toast
- [ ] Precision/recall table per rule
- [ ] README: what it does, screenshots or a 60-second GIF, architecture, security choices, tradeoffs, how you used AI tools, what you would do next

**Done when:** the README opens with a GIF or short video, includes the scoring table, and has setup steps a stranger can follow from a fresh clone.

**Using AI tools while building:** for each item above, write a short task description first (inputs, outputs, files to touch, tests to pass), hand it to Claude Code or Cursor, then read every line before committing. Keep a short `AI_NOTES.md` of what you asked for and what you had to fix. That log is your answer to the posting's AI-assisted development line.

## Stretch goals and what to skip

Add a stretch goal only after the core is deployed and the README is written. A finished small app beats an unfinished big one.

**Worth adding if time allows**

- A small dashboard: open flags by severity and rule, decisions per day (one raw SQL query, one chart).
- CSV export of decisions, with formula-injection protection.
- A rules settings page where an admin changes thresholds, with each change written to the audit log.
- Case grouping: bundle all flags for one account into one case.

**Skip**

- ML models, graph analysis, or real-time streaming. They pull the project away from full-stack SWE.
- A separate backend service or microservices. More deploy work, little extra signal.
- Multi-tenant organizations, SSO, or email notifications.
- Pixel-perfect design. Clean and consistent is enough.

## Presenting it

Lead with the user problem, then the stack, then one honest limit. Fill numbers in only after you measure them.

**CV bullet (template)**

> Built a full-stack transaction review app in Next.js, React, TypeScript, and PostgreSQL with rule-based flagging, LLM-generated flag explanations, role-based access, and an append-only audit log; shipped with [N] Jest/Playwright tests, Docker, and GitHub Actions CI, deployed on Vercel with Neon Postgres.

**README outline**

1. One-line description and a live demo link (no login needed)
2. A 60-second GIF of queue → flag → decision → audit log
3. Why it exists (the motivation paragraph)
4. Architecture diagram and stack table
5. Security choices and why
6. Rule results (precision/recall per rule and typology) and limits
7. How AI tools were used, and what you had to fix
8. What you would do next

**Interview talking points**

- **Why rules and not ML?** Explainable, testable, and reviewers need to know why something fired. ML would come after collecting reviewer decisions as labels.
- **Why is the LLM only explaining?** A wrong sentence is cheap; a wrong detection is not. Detection stays deterministic and tested.
- **Why no login?** The audience is reviewers, not customers, so the login wall came out; every guest's decisions are scoped to their own session and admin actions are still checked on the server.
- **How do you protect data?** Masking, no free text to the LLM, server-side role checks, insert-only audit log.
- **What would break at 100x data?** Rules run in memory per upload; move them into SQL or a background job with a queue.
- **What did AI tools get wrong?** Have two real examples from `AI_NOTES.md`.

**Stay honest:** you built pipelines at Amex, not a review tool. The motivation is that working next to that team showed you the gap.

## Claude Code setup

One main session builds each phase; four small subagents review, test, check security, and prepare data. Copy the files below into the new repo before the first session starts.

**How a phase runs**

1. Main session: "Read PLAN.md. Build Phase N on branch `phase-N-<name>`."
2. When its Done when passes: "Use the test-writer agent on the modules this phase added."
3. "Use the reviewer agent", then "Use the security-checker agent". Fix what they report.
4. Run `/code-review` (and `/security-review` for Phases 2, 5, and 6), open a PR, wait for green CI, merge.
5. Log what you asked for and what you had to fix in `AI_NOTES.md`.

**Parallel work (optional):** after Phase 1, the rules engine (`lib/rules/`, pure functions and tests) does not depend on the UI. Build it in a second session in its own git worktree while the main session does Phase 2:

```bash
git worktree add ../flagline-rules -b phase-3-rules
cd ../flagline-rules && claude
```

Merge both through pull requests. Keep it to two sessions; more creates merge conflicts faster than it saves time.

**`CLAUDE.md`** (repo root)

```markdown
# Flagline

Read PLAN.md before any work. Build one phase at a time and stop at its "Done when".

## Commands
- npm run dev            # app on localhost:3000
- docker compose up -d   # local Postgres
- npm run lint && npm run typecheck
- npm test               # Jest
- npm run e2e            # Playwright
- npm run check          # lint + typecheck + test

## Rules
- One phase per branch and pull request.
- Money is Decimal, never float. Rules compare amountUsd.
- Every server action checks the role or guest session on the server.
- Never commit .env or data/raw/. Never send full account numbers to the LLM.
- Rules in lib/rules/ are pure functions with Jest tests.
```

**`.claude/agents/reviewer.md`**

```markdown
---
name: reviewer
description: Reviews the current branch against PLAN.md after a phase is built. Use before opening a pull request.
tools: Read, Grep, Glob, Bash
model: sonnet
---
You review a finished phase of Flagline. Read PLAN.md and run `git diff main...HEAD`.
Check that every item and the "Done when" line of the phase are met, and that the code
follows CLAUDE.md. Report: missing items, bugs, and anything that contradicts PLAN.md,
each with file and line. Do not edit files.
```

**`.claude/agents/test-writer.md`**

```markdown
---
name: test-writer
description: Writes Jest and Playwright tests for named modules. Use after a phase adds new code.
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---
Write tests for the modules you are given. For each rule: one case that fires, one that
does not, and edge cases at the threshold. For server actions: a guest gets 403 on admin
actions and cannot read another session's decisions. Run `npm test` until it passes.
Do not change application code; report bugs you find instead.
```

**`.claude/agents/security-checker.md`**

```markdown
---
name: security-checker
description: Checks the code against the Security table in PLAN.md. Use after Phases 2, 5 and 6.
tools: Read, Grep, Glob, Bash
model: sonnet
---
Go through each row of the Security table in PLAN.md. For each, find the code or test
that implements it and say "covered" with a file reference, or "missing" with what is
needed. Also run `npm audit`. Do not edit files.
```

**`.claude/agents/data-prep.md`**

```markdown
---
name: data-prep
description: Owns scripts/ and data/: sampling the IBM AML files, FX rates, and the scoring script.
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---
Follow the Data section of PLAN.md. Read raw files only from data/raw/ and never commit
them. Keep every laundering attempt whole when sampling. Print row counts and the number
of attempts per typology after each run.
```

**Optional hook** (`.claude/settings.json`): runs the checks whenever Claude tries to finish a turn. Exit code 2 sends the failure back so it keeps fixing instead of stopping on red.

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "npm run -s check >&2 || exit 2" } ] }
    ]
  }
}
```

Add the hook after Phase 1, once `npm run check` exists. Use `/agents` inside Claude Code to see or edit the subagents.
