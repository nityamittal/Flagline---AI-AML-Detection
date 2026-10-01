import { cookies } from "next/headers";
import { getAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { GUEST_COOKIE } from "@/lib/guest";

/** Whoever is looking: the signed-in admin, or a guest identified by their session cookie. */
export type Viewer =
  { kind: "admin"; userId: string; login: string } | { kind: "guest"; guestSessionId: string };

/**
 * Resolves the viewer on the server. The guest id always comes from the httpOnly cookie that
 * proxy.ts sets, never from request input, and must match a live GuestSession row.
 */
export async function getViewer(): Promise<Viewer | null> {
  const admin = await getAdmin();
  if (admin) return { kind: "admin", userId: admin.id, login: admin.githubLogin };

  const id = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!id) return null;
  const session = await db.guestSession.findUnique({ where: { id }, select: { id: true } });
  return session ? { kind: "guest", guestSessionId: session.id } : null;
}

/** Prisma filter for "this viewer's" decisions. */
export function decisionOwner(viewer: Viewer) {
  return viewer.kind === "admin"
    ? { userId: viewer.userId }
    : { guestSessionId: viewer.guestSessionId };
}

export function actor(viewer: Viewer) {
  return viewer.kind === "admin"
    ? { actorType: "ADMIN" as const, actorId: viewer.userId }
    : { actorType: "GUEST" as const, actorId: viewer.guestSessionId };
}
