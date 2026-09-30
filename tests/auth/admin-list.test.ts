import { adminLogins, isAdminLogin } from "@/lib/admin-list";

describe("admin allow list", () => {
  afterEach(() => {
    delete process.env.ADMIN_GITHUB_USERNAMES;
  });

  it("parses a comma-separated list, trimming and lower-casing", () => {
    expect(adminLogins(" Alice, bob ,,")).toEqual(new Set(["alice", "bob"]));
  });

  it("matches GitHub logins case-insensitively", () => {
    process.env.ADMIN_GITHUB_USERNAMES = "NityaMittal";

    expect(isAdminLogin("nityamittal")).toBe(true);
    expect(isAdminLogin("someone-else")).toBe(false);
  });

  it("grants admin to nobody when the list is empty or unset", () => {
    expect(isAdminLogin("anyone")).toBe(false);
    process.env.ADMIN_GITHUB_USERNAMES = "";
    expect(isAdminLogin("")).toBe(false);
    expect(isAdminLogin(undefined)).toBe(false);
  });
});
