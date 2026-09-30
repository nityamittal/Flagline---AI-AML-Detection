"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "flagline:intro-dismissed";
const listeners = new Set<() => void>();

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** First-visit explainer; dismissing it is remembered in this browser only. */
export function IntroCard({ firstHref }: { firstHref: string | null }) {
  // Hidden during server render (true), then read from localStorage in the browser.
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true);
  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Private mode or storage blocked: the card simply comes back next visit.
    }
    listeners.forEach((l) => l());
  }

  return (
    <section className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <div className="max-w-2xl">
        <p>
          Rules flagged these synthetic transactions as possible money laundering. Open a flag, read
          why it fired, and approve it for follow-up or dismiss it with a note.
        </p>
        {firstHref && (
          <Link
            href={firstHref}
            className="mt-1 inline-block font-medium underline underline-offset-4"
          >
            Open the first high-severity flag →
          </Link>
        )}
      </div>
      <button type="button" onClick={dismiss} className="text-sky-900 underline underline-offset-4">
        Dismiss
      </button>
    </section>
  );
}
