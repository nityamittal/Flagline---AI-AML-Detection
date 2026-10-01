"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Shown when a page throws. Details stay in the server logs, never on the page.
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        The page couldn&apos;t load. Your decisions so far are saved.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Back to the queue</Link>
        </Button>
      </div>
    </main>
  );
}
