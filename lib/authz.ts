import type { User } from "@prisma/client";
import { isAdminLogin } from "@/lib/admin-list";
import { auth } from "@/lib/auth";
import { authEnabled } from "@/lib/auth-config";
import { db } from "@/lib/db";

/**
 * The signed-in admin, or null for everyone else. Every admin page, route and action calls
 * this on the server. It re-reads the user and the allow list on each call, so removing a
 * username from ADMIN_GITHUB_USERNAMES takes effect without waiting for the JWT to expire.
 * With sign-in not configured, or if Auth.js fails, nobody is admin (fail closed).
 */
export async function getAdmin(): Promise<User | null> {
  if (!authEnabled()) return null;

  let session;
  try {
    session = await auth();
  } catch (error) {
    console.error("[auth] could not read the session:", (error as Error).message);
    return null;
  }
  const id = session?.user?.id;
  if (!id || session?.user?.role !== "ADMIN") return null;

  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.role !== "ADMIN" || !isAdminLogin(user.githubLogin)) return null;
  return user;
}

export function forbiddenResponse(): Response {
  return Response.json({ error: "Only the admin can do this." }, { status: 403 });
}
