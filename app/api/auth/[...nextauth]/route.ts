import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { authEnabled } from "@/lib/auth-config";

// Without the auth variables there is no sign-in to serve; answer 404 instead of letting
// Auth.js throw a configuration error.
const notConfigured = () =>
  Response.json({ error: "Admin sign-in is not configured." }, { status: 404 });

export function GET(request: NextRequest) {
  return authEnabled() ? handlers.GET(request) : notConfigured();
}

export function POST(request: NextRequest) {
  return authEnabled() ? handlers.POST(request) : notConfigured();
}
