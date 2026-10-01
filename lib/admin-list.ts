// ADMIN_GITHUB_USERNAMES is a comma-separated allow list. GitHub logins are case-insensitive.
export function adminLogins(raw = process.env.ADMIN_GITHUB_USERNAMES ?? ""): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  return adminLogins().has(login.trim().toLowerCase());
}

/**
 * The key a GitHub sign-in is matched on: the account's numeric id, as a string. Usernames can
 * be renamed and reused by someone else; ids cannot. Anything that isn't a positive integer is
 * rejected, which also keeps non-numeric ids such as the seed user's "seed:flagline" unreachable.
 */
export function githubIdOf(profile: { id?: unknown } | null | undefined): string | null {
  const id = profile?.id;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? String(id) : null;
}
