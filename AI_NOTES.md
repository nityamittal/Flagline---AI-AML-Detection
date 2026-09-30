# AI notes

A running log of what I asked AI tools for and what I had to fix. See PLAN.md, "Using AI tools while building".

## Phase 1 · skeleton and data

- **Asked:** scaffold Next.js + TypeScript + Tailwind + shadcn/ui, Prisma schema for all seven tables, Docker Compose Postgres, `scripts/sample_data.py`, and CI (lint, type check, build).
- **Notes:**
  - The shadcn registry was unreachable from the build sandbox, so `components/ui/` (button, badge, card) and `components.json` were written by hand to match shadcn's new-york style. `npx shadcn add <component>` works normally on a regular machine.
  - Pinned Prisma 6: Prisma 7 moves `url`/`directUrl` out of `schema.prisma`, and PLAN.md's Neon setup uses `directUrl` in the schema.
  - `sample_data.py` was tested against a small synthetic file in the IBM format, since Kaggle downloads need a signed-in account.
