import type { Prisma } from "@prisma/client";
import { maskAccount } from "@/lib/format";
import { RULES_BY_ID } from "@/lib/rules";

/**
 * Everything an explanation may use: structured fields only, with every account number masked.
 * This is the only shape that reaches the LLM, so free text and full account numbers never can.
 */
export type ExplanationInput = {
  rule: { id: string; name: string; description: string };
  evidence: Record<string, string | number>;
  transaction: {
    time: string;
    from: string;
    to: string;
    amount: string;
    currency: string;
    amountUsd: string;
    paymentType: string;
  };
};

type FlagWithTransaction = {
  ruleId: string;
  details: Prisma.JsonValue;
  transaction: {
    timestamp: Date;
    fromAccount: string;
    toAccount: string;
    amount: Prisma.Decimal;
    currency: string;
    amountUsd: Prisma.Decimal;
    paymentType: string;
  };
};

// Internal ids mean nothing to a reader; the related transactions are shown on the page instead.
const DROPPED_EVIDENCE = new Set([
  "relatedTransactionIds",
  "inboundTransactionId",
  "duplicateOfTransactionId",
]);

export function explanationInput(flag: FlagWithTransaction): ExplanationInput {
  const rule = RULES_BY_ID.get(flag.ruleId);
  const details = (flag.details ?? {}) as Record<string, unknown>;
  const evidence: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(details)) {
    if (DROPPED_EVIDENCE.has(key)) continue;
    if (typeof value === "number") evidence[key] = value;
    else if (typeof value === "string")
      evidence[key] = key === "account" ? maskAccount(value) : value;
  }

  const t = flag.transaction;
  return {
    rule: {
      id: flag.ruleId,
      name: rule?.name ?? flag.ruleId,
      description: rule?.description ?? "",
    },
    evidence,
    transaction: {
      time: t.timestamp.toISOString(),
      from: maskAccount(t.fromAccount),
      to: maskAccount(t.toAccount),
      amount: t.amount.toString(),
      currency: t.currency,
      amountUsd: t.amountUsd.toFixed(2),
      paymentType: t.paymentType,
    },
  };
}
