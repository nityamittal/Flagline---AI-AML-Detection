"use client";

import { useEffect, useState } from "react";
import { undoDecision } from "@/app/flags/actions";

const VISIBLE_MS = 5_000;

/** "Dismissed. Next flag." with Undo for five seconds after a decision. */
export function DecisionToast({ decided, undoFlagId }: { decided: string; undoFlagId?: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;

  return (
    <div
      role="status"
      className="bg-foreground text-background fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-md px-4 py-3 text-sm shadow-lg"
    >
      <span>{decided === "approved" ? "Approved" : "Dismissed"}. Next flag.</span>
      {undoFlagId && (
        <form action={undoDecision}>
          <input type="hidden" name="flagId" value={undoFlagId} />
          <button type="submit" className="font-semibold underline underline-offset-4">
            Undo
          </button>
        </form>
      )}
    </div>
  );
}
