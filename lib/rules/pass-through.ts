import { Prisma } from "@prisma/client";
import { RULES_CONFIG } from "@/lib/rules/config";
import { byTime, groupBy, HOUR_MS, isSelfTransfer } from "@/lib/rules/shared";
import type { Rule, RuleHit, RuleTransaction } from "@/lib/rules/types";

const { windowHours, tolerance } = RULES_CONFIG.passThrough;
const TOLERANCE = new Prisma.Decimal(tolerance);

/**
 * An account receives money and sends a similar amount (within 10% in USD) onward within 3 days.
 * The onward payment is flagged; the evidence names the inbound payment it matches (the most
 * recent match, if there are several).
 */
export const passThrough: Rule = {
  id: "pass-through",
  name: "Pass-through",
  severity: "MEDIUM",
  description: `An account receives money and sends a similar amount (within ${TOLERANCE.mul(100)}% in USD) onward within ${windowHours} hours.`,
  evaluate(txns) {
    const payments = txns.filter((t) => !isSelfTransfer(t));
    const inbound = groupBy(payments, (t) => t.toAccount);
    const hits: RuleHit[] = [];

    for (const [account, outgoing] of groupBy(payments, (t) => t.fromAccount)) {
      const received = (inbound.get(account) ?? []).sort(byTime);
      if (received.length === 0) continue;

      for (const out of outgoing) {
        const match = latestMatch(received, out);
        if (!match) continue;
        const hours = (out.timestamp.getTime() - match.timestamp.getTime()) / HOUR_MS;
        hits.push({
          transactionId: out.id,
          details: {
            account,
            inboundTransactionId: match.id,
            inboundAmountUsd: match.amountUsd.toFixed(2),
            outboundAmountUsd: out.amountUsd.toFixed(2),
            hoursBetween: Math.round(hours * 10) / 10,
            relatedTransactionIds: [match.id],
          },
        });
      }
    }
    return hits;
  },
};

function latestMatch(received: RuleTransaction[], out: RuleTransaction) {
  const outAt = out.timestamp.getTime();
  for (let i = received.length - 1; i >= 0; i--) {
    const inbound = received[i];
    const inAt = inbound.timestamp.getTime();
    if (inAt > outAt) continue;
    if (outAt - inAt > windowHours * HOUR_MS) break;
    if (inbound.amountUsd.lte(0)) continue;
    const allowed = inbound.amountUsd.mul(TOLERANCE);
    if (out.amountUsd.sub(inbound.amountUsd).abs().lte(allowed)) return inbound;
  }
  return null;
}
