import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { AuditLog } from "@prisma/client";
import { db } from "@/lib/db";
import { formatTime } from "@/lib/format";
import { RULES_BY_ID } from "@/lib/rules";
import { actor, getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Audit log · Flagline" };

const LIMIT = 200;

function describe(entry: AuditLog): { text: string; href?: string } {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const rule = RULES_BY_ID.get(String(meta.ruleId))?.name ?? "a";
  switch (entry.action) {
    case "flag.approve":
      return { text: `Approved ${rule} flag`, href: `/flags/${entry.entityId}` };
    case "flag.dismiss":
      return { text: `Dismissed ${rule} flag`, href: `/flags/${entry.entityId}` };
    case "decisions.reset":
      return { text: `Reset their decisions (${meta.cleared ?? 0} cleared)` };
    case "admin.sign_in":
      return { text: "Signed in as admin" };
    case "upload.import":
      return {
        text: `Imported ${meta.fileName} (${meta.rowCount} rows, ${meta.flagged ?? 0} flagged)`,
        href: "/uploads",
      };
    case "upload.failed":
      return { text: `Upload of ${meta.fileName} failed`, href: "/uploads" };
    default:
      return { text: entry.action };
  }
}

export default async function AuditPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");

  // Visitors see only their own entries; the admin sees everything.
  const me = actor(viewer);
  const entries = await db.auditLog.findMany({
    where: viewer.kind === "admin" ? undefined : me,
    orderBy: { createdAt: "desc" },
    take: LIMIT,
  });
  const adminIds = [
    ...new Set(entries.filter((e) => e.actorType === "ADMIN").map((e) => e.actorId)),
  ];
  const admins = new Map(
    (
      await db.user.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, githubLogin: true },
      })
    ).map((u) => [u.id, u.githubLogin]),
  );
  const who = (entry: AuditLog) => {
    if (entry.actorType === me.actorType && entry.actorId === me.actorId) return "You";
    if (entry.actorType === "ADMIN") return admins.get(entry.actorId) ?? "Admin";
    return `Guest …${entry.actorId.slice(-4)}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {viewer.kind === "admin"
            ? "Every recorded action, newest first."
            : "Your own actions, newest first. Other visitors never see them."}{" "}
          Entries are append-only: nothing here can be edited or deleted.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Approve or dismiss a flag in the{" "}
          <Link href="/" className="underline underline-offset-4">
            review queue
          </Link>{" "}
          and it shows up here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const { text, href } = describe(entry);
                const note = (entry.metadata as { note?: string } | null)?.note;
                return (
                  <tr key={entry.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatTime(entry.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{who(entry)}</td>
                    <td className="px-3 py-2">
                      {href ? (
                        <Link href={href} className="hover:underline">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                    <td className="text-muted-foreground px-3 py-2">{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {entries.length === LIMIT && (
        <p className="text-muted-foreground text-xs">Showing the latest {LIMIT} entries.</p>
      )}
    </main>
  );
}
