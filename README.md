# Flagline

Review rule-flagged transactions from a synthetic AML dataset. Rules flag suspicious
transactions, an LLM explains each flag in plain English, and any visitor, with no login,
approves or dismisses it. Every decision goes into an audit log.

> Portfolio project, not production compliance software. All data is synthetic.

**Status:** Phase 1 (skeleton and data) of [PLAN.md](PLAN.md).

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
npm run dev                 # http://localhost:3000
```

`GET /api/health` reports whether the app can reach the database.

Checks: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`.

## Data

See [data/README.md](data/README.md) for how `demo.csv` and `labels.csv` are sampled from the
IBM AML dataset with `scripts/sample_data.py`.

Data credit: Altman et al., "Realistic Synthetic Financial Transactions for Anti-Money
Laundering Models", NeurIPS 2023.

## License

MIT
