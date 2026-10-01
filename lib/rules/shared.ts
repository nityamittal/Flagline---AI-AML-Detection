import { RULES_CONFIG } from "@/lib/rules/config";
import type { RuleHit, RuleTransaction } from "@/lib/rules/types";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** An account paying itself (IBM's "Reinvestment" rows) is not a payment between parties. */
export function isSelfTransfer(txn: RuleTransaction): boolean {
  return txn.fromAccount === txn.toAccount;
}

export function byTime(a: RuleTransaction, b: RuleTransaction): number {
  return a.timestamp.getTime() - b.timestamp.getTime() || a.id.localeCompare(b.id);
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

export function relatedIds(ids: string[], exclude: string): string[] {
  return ids.filter((id) => id !== exclude).slice(0, RULES_CONFIG.maxRelatedIds);
}

/**
 * Fan-out and fan-in: for each account, slide a time window over its payments (outgoing for
 * fan-out, incoming for fan-in). Whenever one window holds payments to/from at least
 * `minCounterparties` distinct accounts, and at least `minDistinctRatio` of its payments go
 * to distinct accounts, every payment in that window is flagged.
 */
export function counterpartyBursts(
  txns: RuleTransaction[],
  side: "out" | "in",
  {
    minCounterparties,
    windowDays,
    minDistinctRatio,
  }: { minCounterparties: number; windowDays: number; minDistinctRatio: number },
): RuleHit[] {
  const account = (t: RuleTransaction) => (side === "out" ? t.fromAccount : t.toAccount);
  const counterparty = (t: RuleTransaction) => (side === "out" ? t.toAccount : t.fromAccount);
  const windowMs = windowDays * DAY_MS;
  const hits = new Map<string, RuleHit>();

  for (const [acct, payments] of groupBy(
    txns.filter((t) => !isSelfTransfer(t)),
    account,
  )) {
    payments.sort(byTime);
    const counts = new Map<string, number>();
    let start = 0;
    for (let end = 0; end < payments.length; end++) {
      const cp = counterparty(payments[end]);
      counts.set(cp, (counts.get(cp) ?? 0) + 1);
      while (payments[end].timestamp.getTime() - payments[start].timestamp.getTime() > windowMs) {
        const old = counterparty(payments[start]);
        const left = counts.get(old)! - 1;
        if (left === 0) counts.delete(old);
        else counts.set(old, left);
        start++;
      }
      const size = end - start + 1;
      if (counts.size < minCounterparties || counts.size / size < minDistinctRatio) continue;

      const window = payments.slice(start, end + 1);
      const ids = window.map((t) => t.id);
      for (const txn of window) {
        if (hits.has(txn.id)) continue;
        hits.set(txn.id, {
          transactionId: txn.id,
          details: {
            account: acct,
            counterpartyCount: counts.size,
            windowDays,
            windowStart: window[0].timestamp.toISOString(),
            windowEnd: window[window.length - 1].timestamp.toISOString(),
            relatedTransactionIds: relatedIds(ids, txn.id),
          },
        });
      }
    }
  }
  return [...hits.values()];
}
