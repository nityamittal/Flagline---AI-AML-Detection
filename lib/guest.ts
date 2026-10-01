import { db } from "@/lib/db";

export const GUEST_COOKIE = "flagline_guest";

export function guestTtlDays(): number {
  const days = Number(process.env.GUEST_SESSION_TTL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : 7;
}

/** Marks the session as active. Returns false when the id is unknown (never issued, or cleaned up). */
export async function touchGuestSession(id: string): Promise<boolean> {
  const { count } = await db.guestSession.updateMany({
    where: { id },
    data: { lastSeenAt: new Date() },
  });
  return count === 1;
}

export async function createGuestSession(): Promise<string> {
  // The id doubles as the cookie secret, so it comes from a CSPRNG rather than the schema's cuid default.
  const session = await db.guestSession.create({ data: { id: crypto.randomUUID() } });
  return session.id;
}
