import { RULES_CONFIG } from "@/lib/rules/config";
import { byTime, groupBy, isSelfTransfer } from "@/lib/rules/shared";
import type { Rule, RuleHit } from "@/lib/rules/types";

const { windowMinutes } = RULES_CONFIG.duplicate;
const MINUTE_MS = 60 * 1000;

/** Same payer, payee and USD amount within an hour. The later payment is flagged. */
export const duplicate: Rule = {
  id: "duplicate",
  name: "Duplicate",
  severity: "LOW",
  description: `Same payer, payee and amount within ${windowMinutes} minutes.`,
  evaluate(txns) {
    const hits: RuleHit[] = [];
    const groups = groupBy(
      txns.filter((t) => !isSelfTransfer(t)),
      (t) => `${t.fromAccount}|${t.toAccount}|${t.amountUsd.toFixed(2)}`,
    );

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort(byTime);
      for (let i = 1; i < group.length; i++) {
        const minutes =
          (group[i].timestamp.getTime() - group[i - 1].timestamp.getTime()) / MINUTE_MS;
        if (minutes > windowMinutes) continue;
        hits.push({
          transactionId: group[i].id,
          details: {
            duplicateOfTransactionId: group[i - 1].id,
            minutesBetween: minutes,
            amountUsd: group[i].amountUsd.toFixed(2),
            relatedTransactionIds: [group[i - 1].id],
          },
        });
      }
    }
    return hits;
  },
};
