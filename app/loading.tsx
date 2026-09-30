export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="bg-muted h-7 w-48 animate-pulse rounded" />
      <div className="bg-muted h-4 w-96 max-w-full animate-pulse rounded" />
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-muted h-9 w-full animate-pulse rounded" />
        ))}
      </div>
    </main>
  );
}
