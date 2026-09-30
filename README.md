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

### Admin sign-in (optional locally)

Visitors never sign in: each browser gets a guest session cookie on its first visit. Only the
admin signs in, with GitHub, to upload CSVs. To enable it locally, fill these in `.env`:

- `AUTH_SECRET`: run `npx auth secret`, or use any random 32-byte base64 string.
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`: from a GitHub OAuth app (GitHub → Settings →
  Developer settings → OAuth Apps) with callback URL
  `http://localhost:3000/api/auth/callback/github`.
- `ADMIN_GITHUB_USERNAMES`: your GitHub username. Anyone else who signs in stays a guest.

## Data

See [data/README.md](data/README.md) for how `demo.csv` and `labels.csv` are sampled from the
IBM AML dataset with `scripts/sample_data.py`.

Data credit: Altman et al., "Realistic Synthetic Financial Transactions for Anti-Money
Laundering Models", NeurIPS 2023.

## License

MIT
