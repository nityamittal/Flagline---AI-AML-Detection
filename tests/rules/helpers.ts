import { Prisma } from "@prisma/client";
import type { RuleTransaction } from "@/lib/rules/types";

const START = Date.parse("2022-09-01T00:00:00Z");

/** A transaction `hours` after 2022-09-01 00:00 UTC. */
export function txn(
  id: string,
  from: string,
  to: string,
  usd: string | number,
  hours = 0,
): RuleTransaction {
  return {
    id,
    fromAccount: from,
    toAccount: to,
    amountUsd: new Prisma.Decimal(String(usd)),
    timestamp: new Date(START + hours * 60 * 60 * 1000),
  };
}

export const ids = (hits: { transactionId: string }[]) => hits.map((h) => h.transactionId).sort();
