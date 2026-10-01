import { cn } from "@/lib/utils";

const STYLES = {
  HIGH: "border-red-200 bg-red-50 text-red-800",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
  LOW: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

export function SeverityBadge({ severity }: { severity: keyof typeof STYLES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        STYLES[severity],
      )}
    >
      {severity[0] + severity.slice(1).toLowerCase()}
    </span>
  );
}
