import { RULES_CONFIG } from "@/lib/rules/config";
import { isSelfTransfer } from "@/lib/rules/shared";
import type { Rule } from "@/lib/rules/types";

const { percentile } = RULES_CONFIG.largeAmount;

/** USD amount strictly above the upload's 99th percentile (nearest-rank). */
export const largeAmount: Rule = {
  id: "large-amount",
  name: "Large amount",
  severity: "MEDIUM",
  description: `The USD amount is above the ${percentile * 100}th percentile of the upload.`,
  evaluate(txns) {
    const payments = txns.filter((t) => !isSelfTransfer(t));
    if (payments.length === 0) return [];

    const sorted = payments.map((t) => t.amountUsd).sort((a, b) => a.comparedTo(b));
    const threshold = sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];

    return payments
      .filter((t) => t.amountUsd.gt(threshold))
      .map((t) => ({
        transactionId: t.id,
        details: {
          amountUsd: t.amountUsd.toFixed(2),
          thresholdUsd: threshold.toFixed(2),
          percentile: percentile * 100,
        },
      }));
  },
};
