import Link from "next/link";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetDecisions } from "@/app/flags/actions";
import { db } from "@/lib/db";
import { formatTime, formatUsd, maskAccount } from "@/lib/format";
import { listFlags, PAGE_SIZE, parseFilters, queueCounts, type QueueFilters } from "@/lib/review";
import { RULES, RULES_BY_ID } from "@/lib/rules";
import { getViewer } from "@/lib/viewer";

export default async function ReviewQueue({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10 text-sm">
        Your session could not be started. Reload the page to continue.
      </main>
    );
  }

  const [{ flags, total }, counts, uploads] = await Promise.all([
    listFlags(viewer, filters),
    queueCounts(viewer),
    db.upload.findMany({
      where: { status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, createdAt: true },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (overrides: Partial<QueueFilters>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...overrides })) {
      if (
        value !== undefined &&
        !(key === "page" && value === 1) &&
        !(key === "status" && value === "open")
      ) {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      {params.notice === "not-admin" && (
        <p role="status" className="rounded-md border bg-amber-50 px-4 py-3 text-sm text-amber-900">
          That GitHub account isn&apos;t on the admin list, so you&apos;re still browsing as a
          guest. Guests can review every flag; only the admin uploads data.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Review queue</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Rules flagged these transactions. Approve a flag to escalate it, or dismiss it with a
            note.
          </p>
        </div>
        <div className="flex gap-2 text-xs" aria-label="Queue counts">
          <span className="bg-muted rounded-full px-3 py-1">
            Open {counts.open.toLocaleString("en-US")}
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-red-800">
            High {counts.high.toLocaleString("en-US")}
          </span>
          <span className="bg-muted rounded-full px-3 py-1">
            Reviewed today {counts.reviewedToday.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" action="/">
        <Select
          name="status"
          label="Status"
          value={filters.status}
          options={[
            ["open", "Open"],
            ["reviewed", "Reviewed"],
            ["all", "All"],
          ]}
        />
        <Select
          name="severity"
          label="Severity"
          value={filters.severity}
          options={[
            ["", "Any"],
            ["HIGH", "High"],
            ["MEDIUM", "Medium"],
            ["LOW", "Low"],
          ]}
        />
        <Select
          name="rule"
          label="Rule"
          value={filters.rule}
          options={[["", "Any"], ...RULES.map((r) => [r.id, r.name] as [string, string])]}
        />
        <Select
          name="upload"
          label="Upload"
          value={filters.upload}
          options={[
            ["", "Any"],
            ...uploads.map(
              (u) =>
                [u.id, `${u.fileName} · ${formatTime(u.createdAt).slice(0, 10)}`] as [
                  string,
                  string,
                ],
            ),
          ]}
        />
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>

      {total === 0 ? (
        <EmptyQueue
          noFlags={counts.total === 0}
          filtered={
            filters.status !== "open" || Boolean(filters.severity || filters.rule || filters.upload)
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-3 py-2 text-right font-medium">Amount (USD)</th>
                  <th className="px-3 py-2 font-medium">From → To</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => {
                  const decision = flag.decisions[0];
                  return (
                    <tr key={flag.id} className="hover:bg-muted/40 border-t">
                      <td className="px-3 py-2">
                        <SeverityBadge severity={flag.severity} />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/flags/${flag.id}`} className="font-medium hover:underline">
                          {RULES_BY_ID.get(flag.ruleId)?.name ?? flag.ruleId}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUsd(flag.transaction.amountUsd)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {maskAccount(flag.transaction.fromAccount)} →{" "}
                        {maskAccount(flag.transaction.toAccount)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatTime(flag.transaction.timestamp)}
                      </td>
                      <td className="px-3 py-2">
                        {decision
                          ? decision.outcome === "APPROVED"
                            ? "Approved"
                            : "Dismissed"
                          : "Open"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className="text-muted-foreground flex items-center justify-between text-sm">
            <span>
              {total.toLocaleString("en-US")} flag{total === 1 ? "" : "s"} · page {filters.page} of{" "}
              {pages}
            </span>
            <span className="flex gap-3">
              {filters.page > 1 && (
                <Link href={href({ page: filters.page - 1 })} className="hover:underline">
                  ← Previous
                </Link>
              )}
              {filters.page < pages && (
                <Link href={href({ page: filters.page + 1 })} className="hover:underline">
                  Next →
                </Link>
              )}
            </span>
          </nav>
        </>
      )}
    </main>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="bg-background h-8 rounded-md border px-2"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyQueue({ noFlags, filtered }: { noFlags: boolean; filtered: boolean }) {
  if (noFlags) {
    return (
      <p className="text-muted-foreground text-sm">
        No flags yet. The admin imports transactions on the Uploads page (or run{" "}
        <code>npm run seed</code> locally), and the rules flag them.
      </p>
    );
  }
  if (filtered) {
    return <p className="text-muted-foreground text-sm">No flags match these filters.</p>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve reviewed every flag.</CardTitle>
        <CardDescription>
          Your decisions are only visible to you. Start over to review the queue again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={resetDecisions}>
          <Button type="submit" variant="outline">
            Reset my decisions
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
