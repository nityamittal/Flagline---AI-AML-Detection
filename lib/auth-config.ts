/**
 * Admin sign-in is optional: without AUTH_SECRET and a GitHub OAuth app the app still runs, as a
 * guest-only demo. Everything that touches Auth.js checks this first, so a missing variable
 * never reaches Auth.js (which would throw on every request).
 */
export function authEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.AUTH_SECRET && env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET);
}
