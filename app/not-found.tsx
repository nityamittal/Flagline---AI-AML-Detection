import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-3 px-4 py-16">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground text-sm">
        That page or flag doesn&apos;t exist. Flags disappear when their upload is removed.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to the review queue
      </Link>
    </main>
  );
}
