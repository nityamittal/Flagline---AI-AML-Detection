import { db } from "@/lib/db";

export type Limit = { limit: number; windowSeconds: number };

// Generous for a person, tight for a script.
export const LIMITS = {
  /** New guest sessions per IP: stops a cookie-less bot from creating a row per request. */
  newGuestSession: { limit: 30, windowSeconds: 10 * 60 },
  /** Decisions (approve, dismiss, reset) per IP. */
  decision: { limit: 60, windowSeconds: 60 },
} satisfies Record<string, Limit>;

/**
 * Counts one hit against `key` in the current fixed window and says whether it is allowed.
 * Counters live in Postgres so every server instance shares them; one atomic upsert per hit.
 */
export async function rateLimit(
  key: string,
  { limit, windowSeconds }: Limit,
  now = Date.now(),
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  // "windowStart" is a UTC timestamp without time zone, like every Prisma DateTime column.
  const [row] = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${new Date(windowStart).toISOString()}::timestamp, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"
  `;
  return {
    ok: row.count <= limit,
    retryAfterSeconds: Math.ceil((windowStart + windowMs - now) / 1000),
  };
}

/** The client's IP as reported by the hosting proxy (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
