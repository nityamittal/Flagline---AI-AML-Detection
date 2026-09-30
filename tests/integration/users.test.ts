// Admin users are keyed on GitHub's numeric account id; the login is only a display name.
import { db } from "@/lib/db";
import { describeDb, resetDb } from "./db";

describeDb("admin users", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("lets two accounts share a login (a renamed username taken over), never a GitHub id", async () => {
    await db.user.create({ data: { githubId: "1001", githubLogin: "octo" } });

    await expect(
      db.user.create({ data: { githubId: "2002", githubLogin: "octo" } }),
    ).resolves.toMatchObject({ githubId: "2002" });
    await expect(
      db.user.create({ data: { githubId: "1001", githubLogin: "someone-else" } }),
    ).rejects.toThrow(/Unique constraint/);
  });
});
