import { RULES_CONFIG } from "@/lib/rules/config";
import { counterpartyBursts } from "@/lib/rules/shared";
import type { Rule } from "@/lib/rules/types";

const { minCounterparties, windowDays } = RULES_CONFIG.fanOut;

export const fanOut: Rule = {
  id: "fan-out",
  name: "Fan-out",
  severity: "HIGH",
  description: `One account pays ${minCounterparties} or more distinct accounts within ${windowDays} days.`,
  evaluate: (txns) => counterpartyBursts(txns, "out", RULES_CONFIG.fanOut),
};
