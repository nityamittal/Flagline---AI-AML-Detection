"use client";

import { useActionState } from "react";
import { decideFlag, type DecisionState } from "@/app/flags/actions";
import { Button } from "@/components/ui/button";

type Props = {
  flagId: string;
  current: { outcome: "APPROVED" | "DISMISSED"; note: string | null } | null;
};

export function DecisionPanel({ flagId, current }: Props) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(decideFlag, {});

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-sm font-semibold">Your decision</h2>
      {current && (
        <p className="text-muted-foreground text-xs">
          You {current.outcome === "APPROVED" ? "approved" : "dismissed"} this flag. Deciding again
          replaces it.
        </p>
      )}
      <input type="hidden" name="flagId" value={flagId} />
      <label className="flex flex-col gap-1 text-sm">
        <span>Note (required to dismiss)</span>
        <textarea
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={current?.note ?? ""}
          className="bg-background rounded-md border px-2 py-1.5"
          placeholder="e.g. Known payroll account"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="outcome" value="APPROVED" disabled={pending} className="flex-1">
          Approve flag
        </Button>
        <Button
          type="submit"
          name="outcome"
          value="DISMISSED"
          variant="outline"
          disabled={pending}
          className="flex-1"
        >
          Dismiss
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">Approve escalates the flag for follow-up.</p>
    </form>
  );
}
