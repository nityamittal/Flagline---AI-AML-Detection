import { RULES_CONFIG } from "@/lib/rules/config";
import { counterpartyBursts } from "@/lib/rules/shared";
import type { Rule } from "@/lib/rules/types";

const { minCounterparties, windowDays } = RULES_CONFIG.fanIn;

export const fanIn: Rule = {
  id: "fan-in",
  name: "Fan-in",
  severity: "HIGH",
  description: `One account receives from ${minCounterparties} or more distinct accounts within ${windowDays} days.`,
  evaluate: (txns) => counterpartyBursts(txns, "in", RULES_CONFIG.fanIn),
};
