import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>You don&apos;t have access to this page</CardTitle>
          <CardDescription>
            Uploads are admin-only. You can still review every flag in the{" "}
            <Link href="/" className="underline underline-offset-4">
              review queue
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
