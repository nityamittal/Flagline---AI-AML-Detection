import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Uploads · Flagline" };

const STATUS_VARIANT = { DONE: "secondary", PROCESSING: "outline", FAILED: "destructive" } as const;

export default async function UploadsPage() {
  if (!(await getAdmin())) forbidden();

  const uploads = await db.upload.findMany({ orderBy: { createdAt: "desc" }, take: 20 });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Uploads</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Import a CSV of transactions. The whole file is checked first; any error rejects it and
          nothing is saved.
        </p>
      </div>

      <UploadForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Past uploads</h2>
        {uploads.length === 0 ? (
          <p className="text-muted-foreground text-sm">No uploads yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Rows</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id} className="border-t">
                    <td className="px-3 py-2">{upload.fileName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {upload.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {upload.rowCount.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[upload.status]}>{upload.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
