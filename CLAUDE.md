# Flagline

Read PLAN.md before any work. Build one phase at a time and stop at its "Done when".

@AGENTS.md

## Commands

- npm run dev # app on localhost:3000
- docker compose up -d # local Postgres
- npm run lint && npm run typecheck
- npm test # Jest (from Phase 3)
- npm run e2e # Playwright (from Phase 5)
- npm run check # lint + typecheck (+ test once Jest lands)

## Rules

- One phase per branch and pull request.
- Money is Decimal, never float. Rules compare amountUsd.
- Every server action checks the role or guest session on the server.
- Never commit .env or data/raw/. Never send full account numbers to the LLM.
- Rules in lib/rules/ are pure functions with Jest tests.
