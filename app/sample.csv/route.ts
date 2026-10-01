import { readFile } from "node:fs/promises";
import path from "node:path";

// The upload page's "Download the sample file" link. Serves data/demo.csv itself (bundled via
// outputFileTracingIncludes in next.config.ts) rather than keeping a second copy in public/.
// The data is synthetic and already public, so no session is needed.
export async function GET() {
  const csv = await readFile(path.join(process.cwd(), "data", "demo.csv"));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="flagline-sample.csv"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
