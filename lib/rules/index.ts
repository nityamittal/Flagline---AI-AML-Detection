import { duplicate } from "@/lib/rules/duplicate";
import { fanIn } from "@/lib/rules/fan-in";
import { fanOut } from "@/lib/rules/fan-out";
import { largeAmount } from "@/lib/rules/large-amount";
import { passThrough } from "@/lib/rules/pass-through";
import type { Rule, RuleDetails, RuleTransaction, Severity } from "@/lib/rules/types";

export const RULES: readonly Rule[] = [fanOut, fanIn, passThrough, largeAmount, duplicate];

export const RULES_BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((r) => [r.id, r]));

export type FlagInput = {
  transactionId: string;
  ruleId: string;
  severity: Severity;
  details: RuleDetails;
};

/** Runs every rule over one upload's transactions. Pure: no database access. */
export function runRules(txns: RuleTransaction[]): FlagInput[] {
  return RULES.flatMap((rule) =>
    rule.evaluate(txns).map((hit) => ({
      transactionId: hit.transactionId,
      ruleId: rule.id,
      severity: rule.severity,
      details: hit.details,
    })),
  );
}
