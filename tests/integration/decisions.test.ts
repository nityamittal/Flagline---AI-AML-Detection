// Guests' decisions are isolated: each viewer's queue, flag page, history and reset touch only
// their own rows. Real server actions and queries against a real Postgres; only the Next.js
// request APIs and the admin session are mocked.
let currentGuest: string | null = null;
let currentIp = "203.0.113.1";

jest.mock("@/lib/auth", () => ({ auth: jest.fn(async () => null) }));
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "flagline_guest" && currentGuest ? { name, value: currentGuest } : undefined,
  }),
  headers: async () => new Headers({ "x-forwarded-for": currentIp }),
}));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
jest.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { decideFlag, resetDecisions } from "@/app/flags/actions";
import { db } from "@/lib/db";
import { createGuestSession } from "@/lib/guest";
import { getFlag, listFlags, queueCounts } from "@/lib/review";
import { getViewer, type Viewer } from "@/lib/viewer";
import { describeDb, resetDb, seedSmallUpload } from "./db";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

async function as(guestId: string): Promise<Viewer> {
  currentGuest = guestId;
  return (await getViewer())!;
}

describeDb("decisions are scoped to the viewer's session", () => {
  let guestA: string;
  let guestB: string;
  let flagId: string;

  beforeAll(async () => {
    await resetDb();
    await seedSmallUpload();
    flagId = (await db.flag.findFirstOrThrow()).id;
    guestA = await createGuestSession();
    guestB = await createGuestSession();
  });
  afterAll(() => db.$disconnect());

  it("records guest A's dismissal and moves on", async () => {
    await as(guestA);
    await expect(
      decideFlag({}, form({ flagId, outcome: "DISMISSED", note: "Known payroll account" })),
    ).rejects.toThrow(/^REDIRECT \//);

    const decisions = await db.decision.findMany();
    expect(decisions).toEqual([
      expect.objectContaining({ flagId, guestSessionId: guestA, outcome: "DISMISSED" }),
    ]);
  });

  it("guest B's queue, flag page and history show none of A's decisions", async () => {
    const b = await as(guestB);

    const open = await listFlags(b, { status: "open", page: 1 });
    expect(open.flags.map((f) => f.id)).toContain(flagId);
    expect((await listFlags(b, { status: "reviewed", page: 1 })).total).toBe(0);
    expect((await queueCounts(b)).reviewedToday).toBe(0);

    const page = await getFlag(b, flagId);
    expect(page?.flag.decisions).toEqual([]);
    expect(page?.history).toEqual([]);
  });

  it("guest A sees their own decision", async () => {
    const a = await as(guestA);

    expect((await listFlags(a, { status: "open", page: 1 })).flags.map((f) => f.id)).not.toContain(
      flagId,
    );
    const page = await getFlag(a, flagId);
    expect(page?.flag.decisions[0]).toMatchObject({ outcome: "DISMISSED" });
    expect(page?.history[0]).toMatchObject({ action: "flag.dismiss" });
  });

  it("ignores a guestSessionId smuggled into the form: B can only write B's own decision", async () => {
    await as(guestB);
    await expect(
      decideFlag({}, form({ flagId, outcome: "APPROVED", note: "", guestSessionId: guestA })),
    ).rejects.toThrow(/^REDIRECT/);

    const byGuest = Object.fromEntries(
      (await db.decision.findMany()).map((d) => [d.guestSessionId, d.outcome]),
    );
    expect(byGuest).toEqual({ [guestA]: "DISMISSED", [guestB]: "APPROVED" });
  });

  it("B's reset clears only B's decisions", async () => {
    await as(guestB);
    await expect(resetDecisions()).rejects.toThrow("REDIRECT /");

    const left = await db.decision.findMany();
    expect(left.map((d) => d.guestSessionId)).toEqual([guestA]);
  });

  it("requires a note to dismiss and saves nothing without one", async () => {
    await as(guestB);
    const result = await decideFlag({}, form({ flagId, outcome: "DISMISSED", note: " " }));

    expect(result.error).toMatch(/note/);
    expect(await db.decision.count({ where: { guestSessionId: guestB } })).toBe(0);
  });

  it("rejects a visitor without a valid guest session", async () => {
    currentGuest = "not-a-session";
    const result = await decideFlag({}, form({ flagId, outcome: "APPROVED", note: "" }));

    expect(result.error).toMatch(/session/);
  });

  it("writes audit entries under each guest's own id", async () => {
    const entries = await db.auditLog.findMany({ where: { actorType: "GUEST" } });
    const actions = entries.map((e) => `${e.actorId === guestA ? "A" : "B"}:${e.action}`).sort();

    expect(actions).toEqual(["A:flag.dismiss", "B:decisions.reset", "B:flag.approve"]);
  });

  it("rate-limits decisions per IP", async () => {
    await as(guestA);
    currentIp = "198.51.100.7";
    await db.rateLimit.create({
      data: {
        key: `decision:${currentIp}`,
        windowStart: new Date(Math.floor(Date.now() / 60_000) * 60_000),
        count: 60,
      },
    });

    const result = await decideFlag({}, form({ flagId, outcome: "APPROVED", note: "" }));

    expect(result.error).toMatch(/faster than a person/);
  });
});
