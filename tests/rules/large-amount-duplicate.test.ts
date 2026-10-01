import { duplicate } from "@/lib/rules/duplicate";
import { largeAmount } from "@/lib/rules/large-amount";
import { runRules } from "@/lib/rules";
import { ids, txn } from "./helpers";

describe("large amount", () => {
  // 100 payments of $1..$100: the nearest-rank 99th percentile is $99, so only $100 is above it.
  const hundred = Array.from({ length: 100 }, (_, i) => txn(`t${i + 1}`, `A${i}`, `B${i}`, i + 1));

  it("flags amounts strictly above the 99th percentile", () => {
    const hits = largeAmount.evaluate(hundred);

    expect(ids(hits)).toEqual(["t100"]);
    expect(hits[0].details).toEqual({ amountUsd: "100.00", thresholdUsd: "99.00", percentile: 99 });
  });

  it("does not flag an amount equal to the threshold", () => {
    const tied = [...hundred.slice(0, 99), txn("t100", "A", "B", 99)];

    expect(largeAmount.evaluate(tied)).toEqual([]);
  });

  it("compares decimals exactly and handles tiny or empty uploads", () => {
    const precise = Array.from({ length: 99 }, (_, i) => txn(`t${i}`, "A", `B${i}`, "0.10"));
    precise.push(txn("big", "A", "Z", "0.11"));

    expect(ids(largeAmount.evaluate(precise))).toEqual(["big"]);
    expect(largeAmount.evaluate([txn("only", "A", "B", 5)])).toEqual([]);
    expect(largeAmount.evaluate([])).toEqual([]);
  });
});

describe("duplicate", () => {
  it("flags the later of two identical payments within an hour", () => {
    const hits = duplicate.evaluate([txn("a", "X", "Y", 250, 0), txn("b", "X", "Y", 250, 0.5)]);

    expect(ids(hits)).toEqual(["b"]);
    expect(hits[0].details).toMatchObject({ duplicateOfTransactionId: "a", minutesBetween: 30 });
  });

  it("counts exactly 60 minutes but not 61", () => {
    expect(ids(duplicate.evaluate([txn("a", "X", "Y", 1, 0), txn("b", "X", "Y", 1, 1)]))).toEqual([
      "b",
    ]);
    expect(duplicate.evaluate([txn("a", "X", "Y", 1, 0), txn("b", "X", "Y", 1, 61 / 60)])).toEqual(
      [],
    );
  });

  it("stays quiet when the amount or payee differs", () => {
    expect(duplicate.evaluate([txn("a", "X", "Y", 250), txn("b", "X", "Y", "250.01")])).toEqual([]);
    expect(duplicate.evaluate([txn("a", "X", "Y", 250), txn("b", "X", "Z", 250)])).toEqual([]);
    expect(duplicate.evaluate([])).toEqual([]);
  });
});

describe("runRules", () => {
  it("tags each hit with its rule id and severity", () => {
    const flags = runRules([txn("a", "X", "Y", 250, 0), txn("b", "X", "Y", 250, 0.5)]);

    expect(flags).toContainEqual(
      expect.objectContaining({ transactionId: "b", ruleId: "duplicate", severity: "LOW" }),
    );
  });
});
