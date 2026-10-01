import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { notice } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      {notice === "not-admin" && (
        <p role="status" className="rounded-md border bg-amber-50 px-4 py-3 text-sm text-amber-900">
          That GitHub account isn&apos;t on the admin list, so you&apos;re still browsing as a
          guest. Guests can review every flag; only the admin uploads data.
        </p>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-2xl">Flagline</CardTitle>
            <Badge variant="secondary">Phase 2</Badge>
          </div>
          <CardDescription>
            Rules flag suspicious transactions, an LLM explains each flag in plain English, and a
            reviewer approves or dismisses it. Every decision lands in an audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p>
            Guest sessions, admin sign-in and CSV uploads are in. The review queue and audit log
            arrive in Phase 3.
          </p>
          <div>
            <Button asChild variant="outline">
              <a href="/api/health">Check API health</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
