import { fanIn } from "@/lib/rules/fan-in";
import { fanOut } from "@/lib/rules/fan-out";
import { ids, txn } from "./helpers";

const DAY = 24;

describe("fan-out", () => {
  it("flags every payment when one account pays 5 distinct accounts within 14 days", () => {
    const txns = ["B", "C", "D", "E", "F"].map((to, i) => txn(`t${i}`, "A", to, 100, i * DAY));

    const hits = fanOut.evaluate(txns);

    expect(ids(hits)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(hits[0].details).toMatchObject({ account: "A", counterpartyCount: 5, windowDays: 14 });
    expect(hits[0].details.relatedTransactionIds).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("stays quiet at 4 distinct recipients, however many payments", () => {
    const txns = ["B", "C", "D", "E", "B", "C"].map((to, i) => txn(`t${i}`, "A", to, 100, i));

    expect(fanOut.evaluate(txns)).toEqual([]);
  });

  it("counts a window of exactly 14 days, but not one a minute longer", () => {
    const inside = ["B", "C", "D", "E"].map((to, i) => txn(`t${i}`, "A", to, 1, i));
    const edge = txn("edge", "A", "F", 1, 14 * DAY);
    const late = txn("late", "A", "F", 1, 14 * DAY + 1 / 60);

    expect(ids(fanOut.evaluate([...inside, edge]))).toHaveLength(5);
    expect(fanOut.evaluate([...inside, late])).toEqual([]);
  });

  it("skips hub accounts that mostly repay the same payees (under 80% distinct)", () => {
    // The 5th distinct payee arrives on the 7th payment: 71% distinct.
    const hub = ["B", "C", "B", "C", "D", "E", "F"].map((to, i) => txn(`t${i}`, "A", to, 1, i));
    // The 5th distinct payee arrives on the 6th payment: 83% distinct.
    const burst = ["B", "B", "C", "D", "E", "F"].map((to, i) => txn(`t${i}`, "A", to, 1, i));

    expect(fanOut.evaluate(hub)).toEqual([]);
    expect(ids(fanOut.evaluate(burst))).toHaveLength(6);
  });

  it("ignores self-transfers and handles empty input", () => {
    const txns = ["B", "C", "D", "E"].map((to, i) => txn(`t${i}`, "A", to, 1, i));

    expect(fanOut.evaluate([...txns, txn("self", "A", "A", 1, 5)])).toEqual([]);
    expect(fanOut.evaluate([])).toEqual([]);
  });
});

describe("fan-in", () => {
  it("flags when one account receives from 5 distinct accounts within 14 days", () => {
    const txns = ["B", "C", "D", "E", "F"].map((from, i) => txn(`t${i}`, from, "Z", 50, i * DAY));

    const hits = fanIn.evaluate(txns);

    expect(ids(hits)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(hits[0].details).toMatchObject({ account: "Z", counterpartyCount: 5 });
  });

  it("still fires when senders repeat (no distinct-ratio condition for fan-in)", () => {
    const txns = ["B", "C", "D", "E", "F", "B", "C", "D"].map((from, i) =>
      txn(`t${i}`, from, "Z", 5, i),
    );

    expect(ids(fanIn.evaluate(txns))).toHaveLength(8);
  });

  it("does not treat one account paying many accounts as fan-in", () => {
    const txns = ["B", "C", "D", "E", "F"].map((to, i) => txn(`t${i}`, "A", to, 50, i));

    expect(fanIn.evaluate(txns)).toEqual([]);
  });

  it("stays quiet when the senders are spread over more than 14 days", () => {
    const txns = ["B", "C", "D", "E", "F"].map((from, i) =>
      txn(`t${i}`, from, "Z", 50, i * 4 * DAY),
    );

    expect(fanIn.evaluate(txns)).toEqual([]);
  });
});
