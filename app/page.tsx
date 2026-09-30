import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-2xl">Flagline</CardTitle>
            <Badge variant="secondary">Phase 1</Badge>
          </div>
          <CardDescription>
            Rules flag suspicious transactions, an LLM explains each flag in plain English, and a
            reviewer approves or dismisses it. Every decision lands in an audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p>
            The skeleton is up. The review queue, uploads, and audit log arrive in later phases.
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
