// Pre-generates the explanation for every flag that has none, so demo visitors never wait on
// the LLM or hit a free-tier rate limit. Usage:
//   npm run explain:all [-- --retry-templates] [-- --delay 500]
// --retry-templates also replaces cached template text with LLM text (after an outage, say).
// --delay waits that many milliseconds between LLM calls, for rate-limited free endpoints.
import { db } from "@/lib/db";
import { llmConfig } from "@/lib/llm/client";
import { explainFlag } from "@/lib/llm/explain";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const retryTemplate = process.argv.includes("--retry-templates");
  const delayMs = Number(arg("--delay") ?? 0);
  const config = llmConfig();
  console.log(
    `LLM: ${config.provider}${config.provider === "none" ? " (templates only)" : ` · ${config.model} at ${config.baseUrl}`}`,
  );

  const flags = await db.flag.findMany({
    where: retryTemplate
      ? { OR: [{ explanation: null }, { explanationSource: "TEMPLATE" }] }
      : { explanation: null },
    select: { id: true },
    orderBy: [{ severity: "desc" }, { id: "asc" }],
  });
  console.log(`${flags.length} flag(s) to explain.`);

  const tally = { LLM: 0, TEMPLATE: 0 };
  for (const [i, { id }] of flags.entries()) {
    const result = await explainFlag(id, { retryTemplate });
    if (result) tally[result.source]++;
    if ((i + 1) % 100 === 0 || i + 1 === flags.length) {
      console.log(`  ${i + 1}/${flags.length} · LLM ${tally.LLM} · template ${tally.TEMPLATE}`);
    }
    if (delayMs > 0 && config.provider !== "none") await new Promise((r) => setTimeout(r, delayMs));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
