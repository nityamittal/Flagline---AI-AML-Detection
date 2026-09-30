import { explainFlag } from "@/lib/llm/explain";

/** Generated on first open (up to the 8 s LLM timeout), then cached on the flag. */
export async function Explanation({ flagId }: { flagId: string }) {
  const explanation = await explainFlag(flagId);
  if (!explanation) return null;
  const ai = explanation.source === "LLM";

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold">Why it was flagged</span>
        <span
          className="rounded border border-sky-300 bg-white px-1.5 py-0.5 text-[11px] font-medium"
          title={
            ai
              ? "Written by an open-weight LLM from the rule's evidence. It can be wrong; check the evidence below."
              : "Written from a fixed template for this rule."
          }
        >
          {ai ? "AI-generated" : "Template"}
        </span>
      </div>
      <p>{explanation.text}</p>
    </div>
  );
}

export function ExplanationSkeleton() {
  return (
    <div className="rounded-md border p-4" aria-busy="true" aria-label="Loading explanation">
      <div className="bg-muted mb-2 h-4 w-40 animate-pulse rounded" />
      <div className="bg-muted h-4 w-full animate-pulse rounded" />
    </div>
  );
}
