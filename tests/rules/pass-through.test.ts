import { passThrough } from "@/lib/rules/pass-through";
import { ids, txn } from "./helpers";

describe("pass-through", () => {
  it("flags an onward payment of a similar amount within 3 days", () => {
    const hits = passThrough.evaluate([
      txn("in", "A", "B", 1000, 0),
      txn("out", "B", "C", 950, 10),
    ]);

    expect(ids(hits)).toEqual(["out"]);
    expect(hits[0].details).toEqual({
      account: "B",
      inboundTransactionId: "in",
      inboundAmountUsd: "1000.00",
      outboundAmountUsd: "950.00",
      hoursBetween: 10,
      relatedTransactionIds: ["in"],
    });
  });

  it("accepts exactly 10% difference and exactly 72 hours, but not beyond", () => {
    expect(
      ids(passThrough.evaluate([txn("in", "A", "B", 1000), txn("out", "B", "C", 1100, 72)])),
    ).toEqual(["out"]);
    expect(
      passThrough.evaluate([txn("in", "A", "B", 1000), txn("out", "B", "C", "1100.01", 1)]),
    ).toEqual([]);
    expect(
      passThrough.evaluate([txn("in", "A", "B", 1000), txn("out", "B", "C", 1000, 72.01)]),
    ).toEqual([]);
  });

  it("ignores payments sent before the money arrived", () => {
    expect(
      passThrough.evaluate([txn("out", "B", "C", 1000, 0), txn("in", "A", "B", 1000, 5)]),
    ).toEqual([]);
  });

  it("matches the most recent qualifying inbound payment", () => {
    const hits = passThrough.evaluate([
      txn("early", "A", "B", 500, 0),
      txn("recent", "D", "B", 510, 20),
      txn("out", "B", "C", 505, 24),
    ]);

    expect(hits[0].details.inboundTransactionId).toBe("recent");
  });

  it("ignores self-transfers and empty input", () => {
    expect(passThrough.evaluate([txn("in", "A", "B", 100), txn("self", "B", "B", 100, 1)])).toEqual(
      [],
    );
    expect(passThrough.evaluate([])).toEqual([]);
  });
});
