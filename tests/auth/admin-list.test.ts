import { adminLogins, githubIdOf, isAdminLogin } from "@/lib/admin-list";

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

describe("githubIdOf", () => {
  it("returns GitHub's numeric account id as a string", () => {
    expect(githubIdOf({ id: 1234567 })).toBe("1234567");
  });

  it.each([
    ["the seed user's id", "seed:flagline"],
    ["a numeric string", "1234567"],
    ["zero", 0],
    ["a negative number", -5],
    ["a fraction", 1.5],
    ["a missing id", undefined],
  ])("rejects %s, so no real account can map to it", (_, id) => {
    expect(githubIdOf({ id })).toBeNull();
  });

  it("rejects a missing profile", () => {
    expect(githubIdOf(undefined)).toBeNull();
  });
});
