"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * A approve · D dismiss (focuses the note first if it's empty) · J next open flag · K back.
 * Ignored while typing in a field or with a modifier key held.
 */
export function Shortcuts({ nextHref }: { nextHref: string | null }) {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;

      const click = (outcome: string) =>
        document
          .querySelector<HTMLButtonElement>(`button[name=outcome][value=${outcome}]`)
          ?.click();
      const note = document.querySelector<HTMLTextAreaElement>("textarea[name=note]");

      switch (event.key.toLowerCase()) {
        case "a":
          click("APPROVED");
          break;
        case "d":
          if (note && note.value.trim().length < 3) note.focus();
          else click("DISMISSED");
          break;
        case "j":
          if (nextHref) router.push(nextHref);
          break;
        case "k":
          router.back();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [nextHref, router]);

  return (
    <p className="text-muted-foreground text-xs">
      Shortcuts: <kbd>A</kbd> approve · <kbd>D</kbd> dismiss · <kbd>J</kbd> next · <kbd>K</kbd> back
    </p>
  );
}
