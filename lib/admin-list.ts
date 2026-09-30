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
