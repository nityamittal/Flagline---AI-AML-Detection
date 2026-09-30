import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { DecisionToast } from "@/components/decision-toast";
import { SeverityBadge } from "@/components/severity-badge";
import { formatAmount, formatTime, formatUsd, maskAccount } from "@/lib/format";
import { getFlag, nextOpenFlagId } from "@/lib/review";
import { RULES_BY_ID } from "@/lib/rules";
import { getViewer } from "@/lib/viewer";
import { DecisionPanel } from "./decision-panel";
import { Explanation, ExplanationSkeleton } from "./explanation";
import { Shortcuts } from "./shortcuts";

export const metadata: Metadata = { title: "Flag · Flagline" };

// Human labels for the evidence keys the rules store (lib/rules/*).
const EVIDENCE_LABELS: Record<string, string> = {
  account: "Account",
  counterpartyCount: "Distinct counterparties",
  windowDays: "Window (days)",
  windowStart: "Window start",
  windowEnd: "Window end",
  inboundAmountUsd: "Received (USD)",
  outboundAmountUsd: "Sent onward (USD)",
  hoursBetween: "Hours between",
  amountUsd: "Amount (USD)",
  thresholdUsd: "Threshold (USD)",
  percentile: "Percentile",
  minutesBetween: "Minutes between",
};

function evidenceValue(key: string, value: unknown): string {
  if (key === "account" && typeof value === "string") return maskAccount(value);
  if (key.endsWith("Usd") && typeof value === "string") return formatUsd(value);
  if ((key === "windowStart" || key === "windowEnd") && typeof value === "string") {
    return formatTime(new Date(value));
  }
  return String(value);
}

export default async function FlagPage({ params, searchParams }: PageProps<"/flags/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  const found = await getFlag(viewer, id);
  if (!found) notFound();
  const { flag, details, related, history } = found;
  const rule = RULES_BY_ID.get(flag.ruleId);
  const txn = flag.transaction;
  const current = flag.decisions[0];
  const next = await nextOpenFlagId(viewer, flag.id);
  const evidence = Object.entries(details).filter(([key]) => key in EVIDENCE_LABELS);

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1fr_20rem]">
      {typeof query.decided === "string" && (
        <DecisionToast
          key={String(query.undo)}
          decided={query.decided}
          undoFlagId={typeof query.undo === "string" ? query.undo : undefined}
        />
      )}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link href="/" className="text-muted-foreground text-sm hover:underline">
            ← Review queue
          </Link>
          <div className="flex items-center gap-3">
            <SeverityBadge severity={flag.severity} />
            <h1 className="text-2xl font-semibold">{rule?.name ?? flag.ruleId}</h1>
          </div>
          <p className="text-muted-foreground text-sm">{rule?.description}</p>
        </div>

        <Suspense fallback={<ExplanationSkeleton />}>
          <Explanation flagId={flag.id} />
        </Suspense>

        {evidence.length > 0 && (
          <section className="rounded-md border p-4">
            <h2 className="mb-3 text-sm font-semibold">Evidence</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              {evidence.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{EVIDENCE_LABELS[key]}</dt>
                  <dd className="tabular-nums">{evidenceValue(key, value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="rounded-md border p-4">
          <h2 className="mb-3 text-sm font-semibold">Transaction</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">ID</dt>
            <dd>{txn.externalId}</dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd>{formatTime(txn.timestamp)}</dd>
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-mono">{maskAccount(txn.fromAccount)}</dd>
            <dt className="text-muted-foreground">To</dt>
            <dd className="font-mono">{maskAccount(txn.toAccount)}</dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="tabular-nums">{formatAmount(txn.amount, txn.currency)}</dd>
            <dt className="text-muted-foreground">Amount (USD)</dt>
            <dd className="tabular-nums">
              {formatUsd(txn.amountUsd)}{" "}
              <span className="text-muted-foreground text-xs">(approximate rate)</span>
            </dd>
            <dt className="text-muted-foreground">Payment type</dt>
            <dd>{txn.paymentType}</dd>
            <dt className="text-muted-foreground">Upload</dt>
            <dd>{txn.upload.fileName}</dd>
          </dl>
        </section>

        {related.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Related transactions</h2>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">From → To</th>
                    <th className="px-3 py-2 text-right font-medium">Amount (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {related.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.externalId}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatTime(r.timestamp)}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {maskAccount(r.fromAccount)} → {maskAccount(r.toAccount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUsd(r.amountUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <DecisionPanel
          flagId={flag.id}
          current={current ? { outcome: current.outcome, note: current.note } : null}
        />
        {next && (
          <Link href={`/flags/${next}`} className="text-muted-foreground text-sm hover:underline">
            Skip to next open flag →
          </Link>
        )}
        <Shortcuts nextHref={next ? `/flags/${next}` : null} />
        {history.length > 0 && (
          <section className="text-sm">
            <h2 className="mb-2 font-semibold">Your history on this flag</h2>
            <ul className="text-muted-foreground flex flex-col gap-1">
              {history.map((entry) => {
                const note = (entry.metadata as { note?: string } | null)?.note;
                return (
                  <li key={entry.id}>
                    {entry.action === "flag.approve" ? "Approved" : "Dismissed"} ·{" "}
                    {formatTime(entry.createdAt)}
                    {note && <span className="block text-xs">&ldquo;{note}&rdquo;</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>
    </main>
  );
}
