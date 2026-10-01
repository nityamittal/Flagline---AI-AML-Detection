import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { RULES } from "@/lib/rules";
import { actor, decisionOwner, type Viewer } from "@/lib/viewer";

export const PAGE_SIZE = 50;

const RULE_IDS = RULES.map((r) => r.id) as [string, ...string[]];
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const filtersSchema = z.object({
  status: z.preprocess(first, z.enum(["open", "reviewed", "all"]).catch("open")),
  severity: z.preprocess(first, z.enum(["HIGH", "MEDIUM", "LOW"]).optional().catch(undefined)),
  rule: z.preprocess(first, z.enum(RULE_IDS).optional().catch(undefined)),
  upload: z.preprocess(first, z.string().max(40).optional().catch(undefined)),
  page: z.preprocess(first, z.coerce.number().int().min(1).catch(1)),
});

export type QueueFilters = z.infer<typeof filtersSchema>;

/** Parses the queue's query string; anything invalid falls back to the default. */
export function parseFilters(searchParams: Record<string, string | string[] | undefined>) {
  return filtersSchema.parse(searchParams);
}

function flagWhere(viewer: Viewer, f: Omit<QueueFilters, "page">): Prisma.FlagWhereInput {
  const mine = decisionOwner(viewer);
  return {
    severity: f.severity,
    ruleId: f.rule,
    transaction: f.upload ? { uploadId: f.upload } : undefined,
    decisions:
      f.status === "open" ? { none: mine } : f.status === "reviewed" ? { some: mine } : undefined,
  };
}

// Severity is a Postgres enum declared LOW, MEDIUM, HIGH, so descending puts HIGH first.
const QUEUE_ORDER: Prisma.FlagOrderByWithRelationInput[] = [
  { severity: "desc" },
  { transaction: { timestamp: "desc" } },
  { id: "asc" },
];

export async function listFlags(viewer: Viewer, filters: QueueFilters) {
  const where = flagWhere(viewer, filters);
  const [flags, total] = await Promise.all([
    db.flag.findMany({
      where,
      orderBy: QUEUE_ORDER,
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        transaction: true,
        decisions: { where: decisionOwner(viewer), select: { outcome: true } },
      },
    }),
    db.flag.count({ where }),
  ]);
  return { flags, total };
}

/** The next flag this viewer has not decided, in queue order, skipping `exceptId`. */
export async function nextOpenFlagId(viewer: Viewer, exceptId?: string) {
  const next = await db.flag.findFirst({
    where: {
      ...flagWhere(viewer, { status: "open" }),
      id: exceptId ? { not: exceptId } : undefined,
    },
    orderBy: QUEUE_ORDER,
    select: { id: true },
  });
  return next?.id ?? null;
}

/** Count chips: "Open 312 · High 41 · Reviewed today 18". Raw SQL, scoped to this viewer. */
export async function queueCounts(viewer: Viewer) {
  const owner =
    viewer.kind === "admin"
      ? Prisma.sql`d."userId" = ${viewer.userId}`
      : Prisma.sql`d."guestSessionId" = ${viewer.guestSessionId}`;

  const [row] = await db.$queryRaw<
    { total: bigint; open: bigint; high: bigint; reviewed_today: bigint }[]
  >`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE d.id IS NULL) AS open,
      count(*) FILTER (WHERE d.id IS NULL AND f.severity = 'HIGH') AS high,
      -- Prisma stores "createdAt" as a UTC timestamp without time zone.
      count(*) FILTER (WHERE d."createdAt" >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS reviewed_today
    FROM "Flag" f
    LEFT JOIN "Decision" d ON d."flagId" = f.id AND ${owner}
  `;
  return {
    total: Number(row?.total ?? 0),
    open: Number(row?.open ?? 0),
    high: Number(row?.high ?? 0),
    reviewedToday: Number(row?.reviewed_today ?? 0),
  };
}

export async function getFlag(viewer: Viewer, id: string) {
  const flag = await db.flag.findUnique({
    where: { id },
    include: {
      transaction: { include: { upload: { select: { id: true, fileName: true } } } },
      decisions: { where: decisionOwner(viewer), orderBy: { createdAt: "desc" } },
    },
  });
  if (!flag) return null;

  const details = flag.details as Record<string, unknown>;
  const relatedIds = Array.isArray(details.relatedTransactionIds)
    ? (details.relatedTransactionIds as string[])
    : [];
  const [related, history] = await Promise.all([
    relatedIds.length
      ? db.transaction.findMany({
          where: { id: { in: relatedIds }, uploadId: flag.transaction.uploadId },
          orderBy: { timestamp: "asc" },
        })
      : [],
    // Every decision this viewer made on the flag, including ones they later changed.
    db.auditLog.findMany({
      where: {
        ...actor(viewer),
        entityType: "Flag",
        entityId: id,
        action: { in: ["flag.approve", "flag.dismiss"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return { flag, details, related, history };
}
