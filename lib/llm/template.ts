import { formatTime, formatUsd } from "@/lib/format";
import type { ExplanationInput } from "@/lib/llm/input";

const date = (iso: unknown) =>
  typeof iso === "string" ? formatTime(new Date(iso)).slice(0, 10) : "?";
const usd = (value: unknown) => (typeof value === "string" ? formatUsd(value) : "?");

/** The fallback explanation: exact, a little robotic, and always available. */
export function templateExplanation({
  rule,
  evidence: e,
  transaction: t,
}: ExplanationInput): string {
  switch (rule.id) {
    case "fan-out":
      return `Account ${e.account} paid ${e.counterpartyCount} different accounts between ${date(e.windowStart)} and ${date(e.windowEnd)}, and this ${usd(t.amountUsd)} payment is one of them. Spreading money across many accounts in a short time is a pattern reviewers check.`;
    case "fan-in":
      return `Account ${e.account} received money from ${e.counterpartyCount} different accounts between ${date(e.windowStart)} and ${date(e.windowEnd)}, and this ${usd(t.amountUsd)} payment is one of them. Collecting money from many senders in a short time is a pattern reviewers check.`;
    case "pass-through":
      return `Account ${e.account} received ${usd(e.inboundAmountUsd)} and sent ${usd(e.outboundAmountUsd)} onward ${e.hoursBetween} hours later. Money that moves straight through an account is a pattern reviewers check.`;
    case "large-amount":
      return `This payment of ${usd(e.amountUsd)} is above ${usd(e.thresholdUsd)}, the ${e.percentile}th percentile of amounts in this upload.`;
    case "duplicate":
      return `The same payer sent the same payee ${usd(e.amountUsd)} ${e.minutesBetween} minutes earlier. It may be a repeated payment or a data issue.`;
    default:
      return `This transaction was flagged by the ${rule.name} rule. ${rule.description}`;
  }
}
