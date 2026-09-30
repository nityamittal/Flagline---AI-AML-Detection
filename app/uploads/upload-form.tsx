"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Kept in sync with lib/uploads/validate.ts; the server enforces both again.
const MAX_BYTES = 5 * 1024 * 1024;
const COLUMNS = [
  "external_id",
  "timestamp",
  "from_account",
  "to_account",
  "amount",
  "currency",
  "payment_type",
] as const;
const SAMPLE_URL =
  "https://github.com/nityamittal/Flagline---AI-AML-Detection/blob/main/data/demo.csv";

type RowError = { row: number | null; message: string };
type Preview = {
  fileName: string;
  rowCount: number;
  preview: Record<(typeof COLUMNS)[number], string>[];
  errors: RowError[];
  errorCount: number;
};
type State =
  | { step: "idle" }
  | { step: "checking"; fileName: string }
  | { step: "preview"; file: File; result: Preview }
  | { step: "importing"; file: File; result: Preview }
  | { step: "done"; fileName: string; rowCount: number }
  | { step: "error"; message: string };

async function post(url: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(url, { method: "POST", body });
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, json };
}

export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  const [dragging, setDragging] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setState({ step: "error", message: `${file.name} is larger than 5 MB.` });
      return;
    }
    setState({ step: "checking", fileName: file.name });
    const { ok, json } = await post("/api/uploads/preview", file);
    if (!ok) {
      setState({ step: "error", message: json.error ?? "The file could not be checked." });
      return;
    }
    setState({ step: "preview", file, result: json as Preview });
  }

  async function runImport() {
    if (state.step !== "preview") return;
    setState({ ...state, step: "importing" });
    const { ok, json } = await post("/api/uploads", state.file);
    if (!ok) {
      setState({ step: "error", message: json.error ?? "The import failed." });
      return;
    }
    setState({ step: "done", fileName: state.file.name, rowCount: json.rowCount });
    router.refresh();
  }

  function reset() {
    setState({ step: "idle" });
    if (input.current) input.current.value = "";
  }

  if (state.step === "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{state.rowCount.toLocaleString("en-US")} transactions imported</CardTitle>
          <CardDescription>
            From {state.fileName}. Flags are generated once the rules land in Phase 3.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild>
            <Link href="/">Go to review queue</Link>
          </Button>
          <Button variant="outline" onClick={reset}>
            Upload another file
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.step === "preview" || state.step === "importing") {
    const { result } = state;
    const hasErrors = result.errorCount > 0;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{result.fileName}</CardTitle>
          <CardDescription>
            {result.rowCount.toLocaleString("en-US")} rows.{" "}
            {hasErrors
              ? `${result.errorCount.toLocaleString("en-US")} error(s); fix them and upload again.`
              : "Every row is valid."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasErrors && (
            <ul className="border-destructive/40 bg-destructive/5 text-destructive max-h-60 overflow-y-auto rounded-md border px-4 py-3 text-sm">
              {result.errors.map((error, i) => (
                <li key={i}>
                  {error.row === null ? "File" : `Row ${error.row}`}: {error.message}
                </li>
              ))}
              {result.errorCount > result.errors.length && (
                <li>
                  …and {(result.errorCount - result.errors.length).toLocaleString("en-US")} more
                </li>
              )}
            </ul>
          )}
          {result.preview.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column} className="px-2 py-1.5 font-medium whitespace-nowrap">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, i) => (
                    <tr key={i} className="border-t">
                      {COLUMNS.map((column) => (
                        <td key={column} className="px-2 py-1.5 whitespace-nowrap">
                          {row[column]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={runImport} disabled={hasErrors || state.step === "importing"}>
              {state.step === "importing" ? "Importing…" : "Import"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={state.step === "importing"}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
        disabled={state.step === "checking"}
        className={cn(
          "text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-10 text-sm transition-colors",
          dragging ? "border-primary bg-primary/5" : "hover:bg-muted/40",
        )}
      >
        {state.step === "checking" ? (
          <span>Checking {state.fileName}…</span>
        ) : (
          <>
            <span className="text-foreground font-medium">
              Drop a CSV or click to choose. Max 5 MB.
            </span>
            <span>
              Required columns: <code className="text-xs">{COLUMNS.join(", ")}</code>
            </span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => choose(event.target.files?.[0])}
      />
      {state.step === "error" && (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Need test data?{" "}
        <a href={SAMPLE_URL} className="underline underline-offset-4">
          Download the sample file
        </a>{" "}
        (data/demo.csv, about 20,000 synthetic transactions).
      </p>
    </div>
  );
}
