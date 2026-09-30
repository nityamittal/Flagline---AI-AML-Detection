import { NextResponse, type NextRequest } from "next/server";
import { createGuestSession, GUEST_COOKIE, guestTtlDays, touchGuestSession } from "@/lib/guest";
import { clientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

// Every page visit gets a guest session, with no prompt: an httpOnly cookie holding the
// GuestSession id. A missing or stale cookie (e.g. after the 7-day cleanup) gets a fresh one.
export async function proxy(request: NextRequest) {
  const existing = request.cookies.get(GUEST_COOKIE)?.value;
  if (existing && (await touchGuestSession(existing))) return NextResponse.next();

  const limited = await rateLimit(
    `guest-session:${clientIp(request.headers)}`,
    LIMITS.newGuestSession,
  );
  if (!limited.ok) {
    return new NextResponse(
      "Too many new visits from your network. Wait a few minutes and try again.",
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds), "Content-Type": "text/plain" },
      },
    );
  }

  const id = await createGuestSession();

  // Put the cookie on the forwarded request too, so this first render already sees it.
  request.cookies.set(GUEST_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(GUEST_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: guestTtlDays() * 24 * 60 * 60,
  });
  return response;
}

export const config = {
  // Pages only: skip API routes (auth, uploads, health), Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
