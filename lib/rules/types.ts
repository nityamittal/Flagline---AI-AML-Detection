import type { Prisma } from "@prisma/client";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

/** The fields a rule may look at. Money is Decimal, never float. */
export type RuleTransaction = {
  id: string;
  timestamp: Date;
  fromAccount: string;
  toAccount: string;
  amountUsd: Prisma.Decimal;
};

/** JSON-safe evidence stored on the flag and shown on the flag detail page. */
export type RuleDetails = { [key: string]: string | number | string[] };

export type RuleHit = { transactionId: string; details: RuleDetails };

export type Rule = {
  id: string;
  name: string;
  severity: Severity;
  /** One sentence shown on the flag detail page and in filters. */
  description: string;
  evaluate(txns: RuleTransaction[]): RuleHit[];
};
