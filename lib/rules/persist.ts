import type { Prisma } from "@prisma/client";
import { runRules } from "@/lib/rules";

const CHUNK = 1_000;

export type FlagCounts = { flagged: number; high: number };

/**
 * Runs every rule over one upload and saves the flags. Safe to re-run: the
 * (transactionId, ruleId) unique key skips flags that already exist.
 */
export async function generateFlags(
  tx: Prisma.TransactionClient,
  uploadId: string,
): Promise<FlagCounts> {
  const txns = await tx.transaction.findMany({
    where: { uploadId },
    select: { id: true, timestamp: true, fromAccount: true, toAccount: true, amountUsd: true },
  });
  const flags = runRules(txns);

  for (let i = 0; i < flags.length; i += CHUNK) {
    await tx.flag.createMany({ data: flags.slice(i, i + CHUNK), skipDuplicates: true });
  }

  // Report per transaction, like the upload summary ("312 flagged (41 high)").
  const flagged = new Set(flags.map((f) => f.transactionId));
  const high = new Set(flags.filter((f) => f.severity === "HIGH").map((f) => f.transactionId));
  return { flagged: flagged.size, high: high.size };
}
