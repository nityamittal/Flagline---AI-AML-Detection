import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { guestTtlDays } from "@/lib/guest";

const DAY_MS = 24 * 60 * 60 * 1000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never run unauthenticated, even if the secret was forgotten
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Daily job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Deletes guest sessions idle
 * for more than GUEST_SESSION_TTL_DAYS, which cascades to their decisions, and rate-limit
 * counters older than a day. Audit log entries are kept: the log is append-only.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const now = Date.now();
  const [sessions, counters] = await db.$transaction([
    db.guestSession.deleteMany({
      where: { lastSeenAt: { lt: new Date(now - guestTtlDays() * DAY_MS) } },
    }),
    db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - DAY_MS) } } }),
  ]);
  return Response.json({ deletedGuestSessions: sessions.count, deletedRateLimits: counters.count });
}
