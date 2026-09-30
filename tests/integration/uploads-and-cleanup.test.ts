// Upload endpoints and the cleanup job against a real Postgres. Only the admin session is mocked.
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

import { GET as cleanup } from "@/app/api/cron/cleanup/route";
import { POST as importUpload } from "@/app/api/uploads/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createAdmin, describeDb, resetDb, SMALL_CSV } from "./db";

const mockAuth = auth as unknown as jest.Mock;

function uploadRequest(csv: string) {
  const body = new FormData();
  body.append("file", new File([csv], "small.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/uploads", { method: "POST", body });
}

describeDb("upload endpoint", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("gives a guest 403 and writes nothing", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await importUpload(uploadRequest(SMALL_CSV));

    expect(response.status).toBe(403);
    expect(await db.upload.count()).toBe(0);
    expect(await db.transaction.count()).toBe(0);
  });

  it("imports a small CSV for the admin, with USD amounts, flags and an audit entry", async () => {
    process.env.ADMIN_GITHUB_USERNAMES = "the-admin";
    const admin = await createAdmin("the-admin");
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } });

    const response = await importUpload(uploadRequest(SMALL_CSV));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ rowCount: 3, flagged: 1, high: 0 });
    const euro = await db.transaction.findFirstOrThrow({ where: { externalId: "3" } });
    expect(euro.amount.toString()).toBe("99.99");
    expect(euro.amountUsd.toString()).toBe("104.99"); // 99.99 × 1.05, rounded half-up
    expect(await db.flag.findMany({ select: { ruleId: true } })).toEqual([{ ruleId: "duplicate" }]);
    expect(await db.auditLog.findFirst({ where: { action: "upload.import" } })).toMatchObject({
      actorType: "ADMIN",
      actorId: admin.id,
    });
  });

  it("rejects the whole file when one row is bad", async () => {
    process.env.ADMIN_GITHUB_USERNAMES = "the-admin";
    const admin = await createAdmin("the-admin");
    mockAuth.mockResolvedValue({ user: { id: admin.id, role: "ADMIN" } });

    const response = await importUpload(uploadRequest(SMALL_CSV.replace("99.99", "=1+1")));

    expect(response.status).toBe(422);
    expect(await db.upload.count()).toBe(0);
  });
});

describeDb("rate limiter", () => {
  beforeEach(resetDb);

  it("allows up to the limit in a window, then blocks until the next window", async () => {
    const limit = { limit: 3, windowSeconds: 60 };
    const t = Date.UTC(2026, 0, 1, 12, 0, 10);

    const results = [];
    for (let i = 0; i < 4; i++) results.push((await rateLimit("k", limit, t)).ok);
    expect(results).toEqual([true, true, true, false]);

    expect((await rateLimit("other-key", limit, t)).ok).toBe(true);
    expect((await rateLimit("k", limit, t + 60_000)).ok).toBe(true);
  });
});

describeDb("cleanup cron", () => {
  beforeEach(resetDb);

  it("refuses requests without the secret, or when no secret is configured", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await cleanup(new Request("http://localhost/api/cron/cleanup"))).status).toBe(401);
    const wrong = new Request("http://localhost/", { headers: { authorization: "Bearer nope" } });
    expect((await cleanup(wrong)).status).toBe(401);

    delete process.env.CRON_SECRET;
    const empty = new Request("http://localhost/", { headers: { authorization: "Bearer " } });
    expect((await cleanup(empty)).status).toBe(401);
  });

  it("deletes guest sessions idle for over 7 days, and their decisions", async () => {
    process.env.CRON_SECRET = "s3cret";
    const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    await db.guestSession.createMany({
      data: [
        { id: "stale", lastSeenAt: days(8) },
        { id: "fresh", lastSeenAt: days(1) },
      ],
    });

    const response = await cleanup(
      new Request("http://localhost/", { headers: { authorization: "Bearer s3cret" } }),
    );

    expect(await response.json()).toMatchObject({ deletedGuestSessions: 1 });
    expect((await db.guestSession.findMany()).map((s) => s.id)).toEqual(["fresh"]);
  });
});
